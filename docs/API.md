# API

Fifteen routes, all `POST`, all JSON. There are no `GET` endpoints and no dynamic segments.

**Convention.** Every handler runs its work through `jsonRoute` (`lib/http.ts`) and answers either

```json
{ "success": true, "...": "payload" }
```

or, when the call throws,

```json
{ "success": false, "message": "what went wrong" }
```

with HTTP 500. Internal detail — stack traces, driver objects, generated SQL — is never returned.
The browser never calls `fetch` directly: the `api` object in `lib/api.ts` posts the body, strips the
envelope, and normalises both transport failures and `success: false` payloads into
`{ ok: true, data } | { ok: false, error }`, so callers branch on `response.ok` and render
`response.error`.

`DatabaseConfig`, `ServerOptions`, `GridColumn`, `AlterAction`, `RowMutation` and the rest are the
shapes from `lib/types.ts`. `ServerOptions` is a `DatabaseConfig` without `id`, `name` and `database`
(with `database` optional) — it describes a server before a database has been chosen. For SQLite,
`database` is a file path, and `host`, `port`, `username` and `password` are unused.

`SortDirection` is `"asc" | "desc"`. `GridColumn` is `{ name, type, nullable, isPrimaryKey?, defaultValue? }`
where `type` is a **semantic** type (`VARCHAR(100)`, `DATE`, `BOOLEAN`); each engine's mapping is
applied when the DDL is built.

---

## Connection and server

### POST /api/test-connection

Opens a connection, reads the server version, and counts the tables it can see.

- **Called by:** `components/database-connection-form.tsx`, `components/connections/*`.
- **Request body:** `DatabaseConfig`
- **Success payload:** `{ message, details: { serverVersion?, databaseName?, tablesCount? } }`
- **Errors:** an unreachable server, bad credentials or a missing host is **not** a 500. The route
  returns HTTP 200 with `{ success: false, message }` carrying the driver's message, because
  `testConnection` catches its own errors.

### POST /api/list-databases

Lists the databases on a server, connecting to the engine's admin database when no database is named.

- **Request body:** `{ config: ServerOptions }`
- **Success payload:** `{ databases: string[] }` — an empty array for SQLite, which has no
  server-level database list.
- **Errors:** 500 when the host or username is missing or the server refuses the connection.

### POST /api/create-database

- **Request body:** `{ config: ServerOptions, databaseName: string }`
- **Success payload:** `{ message }` — `Database "name" created`
- **Errors:** 500 when the name is not `[A-Za-z0-9_]+`, when the engine is SQLite, or when the
  server rejects the statement.

### POST /api/drop-database

- **Request body:** `{ config: ServerOptions, databaseName: string }`
- **Success payload:** `{ message }` — `Database "name" dropped`
- **Errors:** 500 for SQLite (each database is a file; there is nothing to drop server-side), for a
  name that is not `[A-Za-z0-9_]+`, or when the server refuses.
- **Guardrail:** the UI gates this with `assessDropDatabase`, which requires the database name typed
  back.

---

## Tables

### POST /api/get-tables

Lists the tables in the connected database, with columns and a row count.

- **Request body:** the `DatabaseConfig` itself, not wrapped.
- **Success payload:** `{ tables: DatabaseTable[] }` — each entry is
  `{ name, columns: DatabaseColumn[], rowCount? }`.
- **Errors:** 500 when the config is incomplete or the connection fails. `rowCount` is omitted when
  the `COUNT(*)` was denied rather than failing the whole call.
- **Note:** tables whose name starts with `_ingesta_` are excluded, so snapshots and the snapshot
  registry never appear as user tables.

### POST /api/create-table

- **Request body:** `{ config: DatabaseConfig, tableConfig: TableCreationConfig }`
- **Success payload:** `{ message }` — `Table "name" created`
- **Errors:** 500 for a blank table name, a config with no columns, an engine-side name collision, or
  a rejected column type. Nothing is created on failure.

### POST /api/insert-data

Inserts the rows for one table. Without `execution` it is one transaction; with it, the rows are cut
into `batchSize` chunks and each chunk is its own transaction.

- **Request body:** `{ config, tableName, columnNames: string[], data: unknown[][], columnTypes?: string[], execution?: InsertExecutionOptions }`
  — `data` is already transformed by `transformDataRows` (or `gridToRows`), and each row is positional
  against `columnNames`. `columnTypes` is index-aligned with `columnNames` and is only read when
  `execution.convertTypes` is on.
- **`execution`:** `{ batchSize, blankCells: "null" | "skip-row", skipEmptyRows, trimStrings, convertTypes, continueOnBatchError }`.
  Absent means `batchSize: 0` — one transaction, the behaviour every earlier caller has.
  `batchSize` is clamped to 5000. `blankCells: "skip-row"` drops a row that has any blank cell;
  a blank cell is otherwise bound as NULL, never as `0`, `false` or a date.
- **Success payload:** `{ insertedRows, skippedRows, totalBatches, processedBatches, failedBatches, batchErrors, warnings, durationMs }`
  — `totalBatches` is how many chunks the rows were cut into, `processedBatches` how many committed.
  Rows that are entirely null are skipped (unless `skipEmptyRows` is off) and counted in `skippedRows`.
- **Errors:** 500 when a value violates a constraint. With one transaction the table keeps the rows it
  had before the call. With batching, the batches that already committed stay — the failure body
  carries the same telemetry fields, so a caller can report how many rows landed and which batch
  failed.
- **Backward compatibility:** a request with only `config`, `tableName`, `columnNames` and `data`
  behaves exactly as before, including the all-or-nothing transaction.

### POST /api/preview-table

Reads one page of a table.

- **Request body:** `{ config, tableName, limit?: number, offset?: number, orderBy?: string, direction?: SortDirection }`
  — `limit` defaults to 10.
- **Success payload:** `{ columns: string[], data: unknown[][], totalRows: number }` — `data` is
  positional against `columns`, and `totalRows` is a separate `COUNT(*)`.
- **Errors:** 500 when the table does not exist, the connection fails, or `orderBy` names a column
  the engine rejects.
- **Note:** without `orderBy` the row order is the engine's; there is no implicit ordering.
  `totalRows` is exact, not an estimate.

### POST /api/table-structure

- **Request body:** `{ config, tableName }`
- **Success payload:** `{ columns: DatabaseColumn[] }`
- **Errors:** 500 when the table does not exist or the connection fails.

### POST /api/alter-table

Applies one structural change.

- **Request body:** `{ config, tableName, change: AlterAction }` where `AlterAction` is one of
  `{ action: "add-column"; column: GridColumn }`,
  `{ action: "drop-column"; column: string }`,
  `{ action: "rename-column"; from: string; to: string }`,
  `{ action: "change-type"; column: string; type: string; nullable: boolean }`,
  `{ action: "rename-table"; to: string }`.
- **Success payload:** `{ message }`
- **Errors:** 500 when the column does not exist, the new name collides, or the engine rejects the
  DDL. `change-type` on SQLite is implemented as a documented table rebuild inside a transaction,
  because SQLite has no `ALTER COLUMN`.
- **Guardrail:** the UI gates `drop-column` with `assessDropColumn` and `change-type` with
  `assessChangeType`.

### POST /api/table-admin

Dropping, emptying and renaming are the three whole-table operations.

- **Request body:** `{ config, tableName, action: "drop" | "truncate" | "rename", to?: string }`
- **Success payload:** `{ message }` for `drop` and `rename`; `{ deletedRows }` for `truncate`.
- **Errors:** 500 when `action` is `rename` and `to` is blank, or when the engine refuses.
- **Note:** `truncate` runs `DELETE FROM` rather than `TRUNCATE`, so it behaves identically on all
  four engines and can report how many rows it removed.

### POST /api/copy-table

Copies one table into another inside the same database.

- **Request body:** `{ config, source, target, mode: "create" | "append" | "replace" }`
- **Success payload:** `{ copiedRows: number }`
- **Errors:** 500 when the target exists for `create`, does not exist for `append`/`replace`, or when
  the two tables share no column names.
- **Note:** `create` uses the engine's CTAS form (`SELECT * INTO` on SQL Server, which has no
  `CREATE TABLE … AS SELECT`). `replace` deletes and re-inserts inside one transaction.

### POST /api/table-rows

Applies one row mutation.

- **Request body:** `{ config, tableName, mutation: RowMutation }` where `RowMutation` is
  `{ action: "update" | "delete" | "insert"; records?: Array<Record<string, unknown>>; target?: RowTarget }`
  and `RowTarget` is `{ primaryKey: string; keys: unknown[] }`.
- **Success payload:** `{ affectedRows: number }`
- **Errors:** 500 when `update`/`delete` have no target or no keys, when `records.length` does not
  match `target.keys.length` for an update, or when a constraint is violated.
- **Note:** keys are matched with `IN`, chunked at 500 keys per statement, and the whole mutation runs
  in one transaction.
- **Guardrail:** the UI gates these with `assessRowUpdate` and `assessRowDelete`.

---

## Snapshots

A snapshot is a real table holding a copy of another table's rows, so it works the same way on every
engine.

### POST /api/snapshots

- **Request body:** `{ config, action, tableName?, snapshotName? }`
  - `{ action: "list" }` → `{ snapshots: TableSnapshot[] }`
  - `{ action: "create", tableName, snapshotName? }` → `{ snapshot: TableSnapshot }`
  - `{ action: "restore", snapshotName }` → `{ restoredRows: number }`
  - `{ action: "drop", snapshotName }` → `{ message }`
- **Success payload:** as above. `TableSnapshot` is `{ name, table, rowCount, createdAt }`.
- **Errors:** 500 when a snapshot operation is missing its name, when the table does not exist, or
  when `drop` is given a name the registry does not know.
- **Storage:** a registry table `_ingesta_snapshots` (`name`, `source_table`, `row_count`,
  `created_at`) is created on demand, and each snapshot's rows live in
  `_ingesta_snap_<source>_<yyyyMMddHHmmss>`. Restore deletes the source's rows and re-inserts from
  the snapshot in one transaction.
- **Guardrail:** the UI gates `restore` with `assessRestoreSnapshot` and `drop` with
  `assessDropSnapshot`.

---

## Query console

### POST /api/run-query

Runs one statement from the SQL console.

- **Request body:** `{ config, sql, maxRows?: number, allowWrite?: boolean }`
- **Success payload:** `{ columns: string[], data: unknown[][], truncated: boolean, durationMs: number }`
- **Errors:** 500 when the statement is refused. `analyseSql` (`lib/guardrails.ts`) decides:
  - an empty statement, more than one statement, or a `PRAGMA` outside the read-only allowlist is
    refused with its `blockedReason`;
  - a statement that is not read-only is refused unless `allowWrite` is true;
  - `maxRows` is clamped to 1–5000 and defaults to 500.
- **Note:** `truncated` is true when the engine had more rows than the cap. Comments and string
  literals are stripped before the statement is classified, so `SELECT 1; DROP TABLE t` cannot pass
  as read-only.
- **Guardrail:** `allowWrite` comes from the `allowWriteSql` setting, which is off by default. The UI
  shows the `assessSql` verdict before the statement runs.
