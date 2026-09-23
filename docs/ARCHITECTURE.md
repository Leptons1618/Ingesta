# Architecture

How Ingesta is put together, and why it is put together that way.

## Intent

Ingesta takes a batch of Excel workbooks in and produces **new** database tables. There is exactly
one import strategy: every selected sheet becomes a new table with an inferred schema, and that
sheet's rows are inserted into it. Nothing maps a sheet onto an existing table, nothing writes into
a table the app did not just create, and nothing is persisted on the server between requests.

A run is one-shot. The browser holds the file list, the chosen connection, the selected sheets and
the run history; the server opens a short-lived database connection per API call, does one job, and
closes it.

## The seven stages

`components/workflow-stepper.tsx` exports `WORKFLOW_STAGES`, the single source of truth for the
stage list. `app/page.tsx` owns the step index and renders one component per stage.

| # | Stage | Owner | What it does |
|---|-------|-------|--------------|
| 1 | Upload | `app/page.tsx`, `components/file-upload-zone.tsx`, `lib/excel.ts` | Collects `File[]`. "Analyze files" calls `parseWorkbooks` and advances to stage 2. |
| 2 | Preview | `components/excel-preview.tsx` | Renders sheets, headers and sample rows from the `ParsedWorkbook`. |
| 3 | Database | `components/database-connection-form.tsx`, `components/database-connection-list.tsx`, `lib/storage.ts` | Creates, tests and saves connection profiles (`ConnectionStorage`), lists databases, creates a database, and loads the database's tables before handing `DatabaseConfig` + `DatabaseTable[]` up to `app/page.tsx`. |
| 4 | Sheets | `components/sheet-selection-interface.tsx` | Picks the sheets that should become tables and emits `SheetInput[]`. |
| 5 | Tables | `components/table-creation-interface.tsx` with `lib/schema.ts`, `lib/transform.ts`, `lib/db/index.ts` | `analyzeSheet` per sheet, editable `TableCreationConfig`, `createTable`, `transformDataRows`, `insertData`. Returns `CreatedTable[]` and `FailedTable[]`. |
| 6 | Verify | `components/table-preview-interface.tsx` | `previewTable` for each created table so the rows can be checked before the run is closed. |
| 7 | Done | `components/results-dashboard.tsx` with `lib/storage.ts` | `buildRunResult` assembles the `OperationResult`, `RunHistory.record` stores it, and the JSON report can be downloaded. |

## The pipeline

Shapes are defined once in `lib/types.ts`; no module redeclares them.

```
File[]                      chosen in components/file-upload-zone.tsx
  -> parseWorkbooks(files)  lib/excel.ts        xlsx.read(..., { cellDates: true })
ExcelFile[]                 { name, sheets: ExcelSheet[], size }
ExcelSheet                  { name, headers: string[], data: unknown[][] }
  -> analyzeSheet(sheet)    lib/schema.ts       analyzeColumn per column
TableCreationConfig         { tableName, columns: ColumnAnalysis[], primaryKey }
  -> transformDataRows(...) lib/transform.ts    per-cell coercion to the column's type
  -> insertData(...)        lib/db/index.ts     one INSERT per row, one transaction
  -> previewTable(...)      lib/db/index.ts     { columns, data, totalRows }
  -> buildRunResult(...)    lib/storage.ts      OperationResult
```

Hop by hop:

- **`File[]` → `parseWorkbooks` (`lib/excel.ts`).** Runs in the browser. A workbook that cannot be
  read never throws: the message is pushed onto `ParsedWorkbook.errors` and the other files still
  parse. Sheets with no data rows are dropped.
- **`ExcelSheet`.** `headers` is the first row of the sheet, with an empty cell becoming
  `column_N`. `data` **excludes the header row** and every row is **padded to the header width**,
  so `row[i]` always lines up with `headers[i]`. `ExcelSheet` deliberately has no `rowCount` or
  `columnCount` field — the row count is `data.length` and the column count is `headers.length`.
- **`analyzeColumn` / `analyzeSheet` (`lib/schema.ts`).** `analyzeColumn` counts blanks as NULL
  (`nullCount`), keeps up to five distinct `samples`, and picks the narrowest type that fits the
  non-blank values. `analyzeSheet` sanitizes the sheet name into a table name, disambiguates
  repeated header labels, and nominates a primary key: the first column with no nulls and no
  duplicate values, else the fallback `id`.
- **`TableCreationConfig`.** The user can rename the table, rename columns, change types, toggle
  nullability and move the primary key before anything is written. Column types stay semantic
  (`BOOLEAN`, `DATE`, `VARCHAR(100)`) — each engine's own mapping is applied when the DDL is built,
  so the value transformer still knows what a column holds.
- **`transformDataRows` (`lib/transform.ts`).** Maps each cell to the value the column's type
  expects: dates become `YYYY-MM-DD` (or `YYYY-MM-DD HH:MM:SS` for DATETIME/TIMESTAMP) in UTC,
  booleans become real booleans, numerics become numbers, everything else stays a string, and
  `null` / `undefined` / `""` become `null`.
- **`insertData` (`lib/db/index.ts`).** One `INSERT` statement built once per table, executed once
  per row inside a single transaction. Rows that are entirely null are skipped.
- **`previewTable`.** Returns the first `limit` rows (default 10), the column names (from the row
  keys, or from column introspection when the table is empty), and a separate `COUNT(*)` as
  `totalRows`.
- **`buildRunResult` (`lib/storage.ts`).** Folds `CreatedTable[]` and `FailedTable[]` into an
  `OperationResult` with per-file and per-table results, using wall time measured around the run.

## The database layer

Two files, and the split between them is the point.

- **`lib/db/dialect.ts`** holds the only per-engine code. One `Dialect` object per engine supplies
  `quote`, `placeholder`, `autoIdColumn`, `adminDatabase`, `databasesSql`, `tablesSql`,
  `columnsSql`, `countSql`, `previewSql`, `versionSql`, `serverVersion` and `open`. `createTableSql`
  builds the `CREATE TABLE` statement from the dialect plus the config; `withSession` opens a
  session, runs the callback, and closes the session whether it resolves or throws. Drivers are
  imported lazily inside `open()`, so no database driver reaches the client bundle.
- **`lib/db/index.ts`** implements each operation exactly once: `testConnection`, `listDatabases`,
  `createDatabase`, `getTables`, `createTable`, `insertData`, `previewTable`. No operation knows
  which engine it is talking to.

Every route handler in `app/api/*/route.ts` is a thin wrapper: parse the body, call one function
from `lib/db`, return it through `jsonRoute` (`lib/http.ts`).

| Engine | Identifier quoting | Parameters | Auto id column | Type mapping |
|--------|--------------------|------------|----------------|--------------|
| PostgreSQL | `"name"` (embedded `"` doubled) | `$1`, `$2`, … | `id SERIAL PRIMARY KEY` | TINYINT→SMALLINT, INT→INTEGER, DATETIME→TIMESTAMP, JSON→JSONB |
| MySQL | `` `name` `` (embedded `` ` `` doubled) | `?` | `id INT AUTO_INCREMENT PRIMARY KEY` | none — inferred types are used as-is |
| SQL Server | `[name]` (embedded `]` doubled) | `@p0`, `@p1`, … | `id INT IDENTITY(1,1) PRIMARY KEY` | BOOLEAN→BIT, DATETIME→DATETIME2, JSON→NVARCHAR(MAX), TEXT→NVARCHAR(MAX), VARCHAR(n)→NVARCHAR(n) |
| SQLite | `"name"` | `?` | `id INTEGER PRIMARY KEY AUTOINCREMENT` | BOOLEAN, TINYINT, SMALLINT, INT, BIGINT→INTEGER; DECIMAL(10,2)→REAL; DATE, DATETIME, JSON→TEXT |

Each dialect also normalises the values it binds to what its driver accepts: node-sqlite3 takes
numbers, strings, bigints, buffers and null only, so SQLite binds `true`/`false` as `1`/`0`. The
other three drivers accept JavaScript booleans directly (`mssql` declares the parameter as `Bit`).

Sessions are per request, never pooled or cached across requests. `testConnection` and
`getTables` count rows with `dialect.countSql` and treat a failed count as "unknown", not as an
error.

## Deliberate decisions

These are invariants, not preferences. Changing one changes behaviour users depend on.

1. **Dates come from the workbook, never from a bare number.** `parseWorkbook` reads with
   `cellDates: true`, so Excel's own date formatting produces real `Date` objects, and
   `isDateTime` (`lib/schema.ts`) accepts only `Date` objects and text containing a time. There is
   no numeric fallback: Excel serials for 1900–2100 span 1–73415, which is also the range of
   ordinary quantities, prices and weights, so guessing there turned integer columns into DATE
   columns and decimal columns into DATETIME columns. Instants are rounded to the nearest second
   before formatting, because Excel stores times as a fraction of a day and a written `17:45:00`
   otherwise arrives a millisecond short and is stored as `17:44:59`.
2. **NULL passes through untouched.** `transformCellValue` maps blank cells to `null` and
   `insertData` binds that value as-is. If a NOT NULL column receives a null, the transaction rolls
   back and the whole batch of rows for that table fails, with the engine's message surfaced to the
   user. The app does not drop offending rows and does not substitute `''` or `0`.
3. **Duplicate header labels are suffixed, not silently merged.** `uniqueNames` in `lib/schema.ts`
   turns `region`, `region`, `region` into `region`, `region_2`, `region_3`. Two columns in one
   table cannot share a name, and dropping one of them would lose data.
4. **Each sheet becomes its own table, and one sheet's failure does not hide the others.** A sheet
   that fails is recorded as a `FailedTable`; the remaining sheets still run; the run status is
   `partial` when some tables were created and some failed, `failed` only when none were, and
   `success` only when all were.
5. **Identifiers are sanitized and then quoted, values are always bound.** `sanitizeIdentifier`
   lowercases, replaces anything outside `[a-z0-9_]`, prefixes a leading digit, collapses
   underscores and truncates to 63 characters. `dialect.quote` escapes the identifier for the
   engine and `dialect.placeholder` produces the parameter marker, so user data never reaches the
   SQL text.
6. **One response convention.** Every route answers `{ success: true, ...payload }` on success and
   `{ success: false, message }` with status 500 on a thrown error (`jsonRoute`). Stack traces and
   internal `details` blobs are not returned. The client normalises both into
   `{ ok: true, data } | { ok: false, error }` in `lib/api.ts`.
7. **Run time is measured, never invented.** The table-creation interface times its own
   create-and-insert loop and hands the elapsed milliseconds to `buildRunResult`
   (`lib/storage.ts`), which stores them as `executionTimeMs`; `summary.recordsProcessed` is the sum
   of the created tables' row counts. Nothing is estimated, and the reported duration excludes the
   time the user spends reviewing the schema.
8. **Columns keep the type the analysis detected; each engine's mapping is applied when the DDL is
   built.** `analyzeSheet` produces semantic types (`BOOLEAN`, `DATE`, `VARCHAR(100)`, …), the
   editor shows and edits those, and `createTableSql` calls `adaptTypeForDatabase` on the way into
   the engine. Adapting in the UI would lose the semantics the value transformer needs — SQLite
   maps `BOOLEAN` to `INTEGER`, and a `yes`/`no` column adapted too early was coerced to `null` and
   rejected by its own `NOT NULL` constraint.
9. **One import strategy: a sheet can only create a new table.** There is no second code path that
   writes into a table the app did not just create, and none should be reintroduced.

## What is deliberately not here

- **No mapping onto existing tables.** A sheet can only create a table. There is no column-mapping
  screen and no "append to table" mode.
- **No SQL export or statement preview.** The generated `CREATE TABLE` and `INSERT` text is built
  and executed server-side; it is not shown or downloadable.
- **No server-side session storage.** Connections, passwords and run history live in the browser's
  `localStorage` (`ConnectionStorage`, `RunHistory`). The server holds credentials only for the
  duration of a single request.
- **No authentication or multi-user support.** Anyone who can reach the app can use any saved
  connection. It is built for a trusted machine or a trusted network.
- **No resume, retry queue or scheduling.** A run is one pass; re-running the workflow is the retry.
- **No streaming.** The whole sheet is transformed in the browser and posted as one JSON body.

## Verifying a change

Two runnable checks exercise the real modules — no mocks, no test framework:

```bash
bun scripts/check-pipeline.ts   # parse -> detect -> transform -> DDL, all four engines
bun scripts/check-sqlite.ts     # real SQLite file: create, insert, preview, introspect
```

`check-pipeline.ts` builds a workbook in memory, runs it through `parseWorkbooks`, `analyzeSheet`,
`transformDataRows` and `createTableSql`, and asserts the invariants above: a bare number is never a
date, duplicate headers are suffixed, rows are padded to the header width, sub-second drift rounds
to the nearest second, and each engine quotes, parameterises and maps types as documented.
`check-sqlite.ts` drives `lib/db` against a throwaway SQLite file and asserts that NULL survives the
round trip, that a `NOT NULL` violation rolls the whole batch back, that booleans land as `1`/`0`,
and that introspection reports keys and nullability correctly.

Both are wired to `pnpm check`; `pnpm check:types` type-checks the app and the scripts.
