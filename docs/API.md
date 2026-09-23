# API

Seven routes, all `POST`, all JSON. There are no `GET` endpoints and no dynamic segments.

**Convention.** Every handler runs its work through `jsonRoute` (`lib/http.ts`) and answers either

```json
{ "success": true, "...": "payload" }
```

or, when the call throws,

```json
{ "success": false, "message": "what went wrong" }
```

with HTTP 500. Internal detail — stack traces, driver objects, generated SQL — is never returned.
The browser never calls `fetch` directly: `postJson` (`lib/api.ts`) posts the body and normalises
both transport failures and `success: false` payloads into `{ ok: true, data } | { ok: false, error }`,
so callers branch on `response.ok` and render `response.error`.

`DatabaseConfig` and `ServerOptions` are the shapes from `lib/types.ts`. `ServerOptions` is a
`DatabaseConfig` without `id`, `name` and `database` (with `database` optional) — it describes a
server before a database has been chosen. For SQLite, `database` is a file path, and `host`,
`port`, `username` and `password` are unused.

## POST /api/test-connection

Opens a connection, reads the server version, and counts the tables it can see.

- **Called by:** `components/database-connection-form.tsx` ("Test connection").
- **Request body:** `DatabaseConfig`
- **Success payload:** `{ message: string, details: { serverVersion?: string, databaseName?: string, tablesCount?: number } }`
- **Errors:** an unreachable server, bad credentials or a missing host is **not** a 500. The route
  returns HTTP 200 with `{ success: false, message }` carrying the driver's message, because
  `testConnection` (`lib/db/index.ts`) catches its own errors.

## POST /api/list-databases

Lists the databases on a server, connecting to the engine's admin database when no database is
named.

- **Called by:** `components/database-connection-form.tsx` (populating the database picker).
- **Request body:** `{ config: ServerOptions }`
- **Success payload:** `{ databases: string[] }` — an empty array for SQLite, which has no
  server-level database list.
- **Errors:** 500 `{ success: false, message }` when the host or username is missing or the server
  refuses the connection.

## POST /api/create-database

Creates a database on the server.

- **Called by:** `components/database-connection-form.tsx` (the "Create database" action).
- **Request body:** `{ config: ServerOptions, databaseName: string }`
- **Success payload:** `{ message: string }` — `Database "name" created`
- **Errors:** 500 when the name is not `[A-Za-z0-9_]+` (`Database names may only contain letters,
  numbers, and underscores`), when the engine is SQLite (`SQLite stores each database as a file;
  choose a new file path instead`), or when the server rejects the statement.

## POST /api/get-tables

Lists the tables in the connected database, with columns and a row count.

- **Called by:** `components/database-connection-list.tsx` (after a connection is selected).
- **Request body:** the `DatabaseConfig` itself, not wrapped.
- **Success payload:** `{ tables: DatabaseTable[] }` — each entry is
  `{ name, columns: DatabaseColumn[], rowCount? }`, where a column is
  `{ name, type, nullable, isPrimaryKey, defaultValue? }`.
- **Errors:** 500 when the config is incomplete or the connection fails. `rowCount` is omitted when
  the `COUNT(*)` was denied rather than failing the whole call.

## POST /api/create-table

Creates one table from a `TableCreationConfig`.

- **Called by:** `components/table-creation-interface.tsx`, once per selected sheet.
- **Request body:** `{ config: DatabaseConfig, tableConfig: TableCreationConfig }`
- **Success payload:** `{ message: string }` — `Table "name" created`
- **Errors:** 500 for a blank table name (`Table name is required`), a config with no columns
  (`A table needs at least one column`), an engine-side name collision, or a rejected column type.
  Nothing is created on failure.

## POST /api/insert-data

Inserts the rows for one table in a single transaction.

- **Called by:** `components/table-creation-interface.tsx`, immediately after `create-table`.
- **Request body:** `{ config: DatabaseConfig, tableName: string, columnNames: string[], data: unknown[][] }`
  — `data` is already transformed by `transformDataRows`, and each row is positional against
  `columnNames`.
- **Success payload:** `{ insertedRows: number }` — rows that are entirely null are skipped and not
  counted.
- **Errors:** 500 when a value violates a constraint. The transaction rolls back, so the table keeps
  the rows it had before the call, and the component records the sheet as a `FailedTable`. NULL is
  bound as NULL; blanks are not rewritten to `''`.

## POST /api/preview-table

Reads the first rows of a table.

- **Called by:** `components/table-preview-interface.tsx`, once per created table.
- **Request body:** `{ config: DatabaseConfig, tableName: string, limit?: number }` — `limit`
  defaults to `10`.
- **Success payload:** `{ columns: string[], data: unknown[][], totalRows: number }` — `data` is
  positional against `columns`, and `totalRows` is a separate `COUNT(*)`.
- **Errors:** 500 when the table does not exist or the connection fails.
- **Note:** the row order is the engine's; there is no `ORDER BY`. `totalRows` is exact, not an
  estimate.
