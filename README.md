# Ingesta

Ingesta turns Excel workbooks into new database tables. Upload one or more workbooks, check the
sheets it found, pick a saved database connection, review the schema it inferred for each sheet,
then create one table per sheet and insert the rows. Connections and run history live in the
browser, so a run can be repeated without re-entering anything but the files.

## The workflow

Seven stages, in order. `components/workflow-stepper.tsx` holds the list, `app/page.tsx` drives it.

| # | Stage | What happens |
|---|-------|--------------|
| 1 | Upload | Add workbooks, then read them. Files that cannot be parsed are reported and skipped. |
| 2 | Preview | Check the sheets, headers and sample rows before choosing a destination. |
| 3 | Database | Test a connection, save it, list or create a database, then pick it. |
| 4 | Sheets | Choose which sheets should become tables in this run. |
| 5 | Tables | Review and edit the inferred schema per sheet, then create the tables and insert the rows. |
| 6 | Verify | Preview the created tables before closing the run. |
| 7 | Done | Read the run summary, download it as JSON, or start the next run. |

## Features

- **Multi-file, multi-sheet import.** Drag and drop or browse; every selected sheet becomes its own
  table (`components/file-upload-zone.tsx`, `lib/excel.ts`).
- **Workbook preview** of sheets, headers and rows before anything is written
  (`components/excel-preview.tsx`).
- **Saved connections.** Profiles are stored in the browser and can be tested, reused and removed
  (`ConnectionStorage` in `lib/storage.ts`, `components/database-connection-form.tsx`).
- **Server-side connection test, database listing and database creation** for engines that support
  them, plus a table list with columns and row counts (`components/database-connection-list.tsx`).
- **Type inference per column** (`lib/schema.ts`): BOOLEAN, DATE/DATETIME, TINYINT/SMALLINT/INT/
  BIGINT, DECIMAL, VARCHAR/TEXT, JSON, with per-engine adaptation for PostgreSQL, MySQL, SQL Server
  and SQLite.
- **Editable schema before creation.** Rename the table and its columns, change types, toggle
  nullability, add or drop a column, and choose the primary key
  (`components/table-creation-interface.tsx`).
- **Duplicate header labels are disambiguated** rather than dropped: two `region` headers become
  `region` and `region_2`.
- **One transaction per table's rows.** NULL is preserved as NULL, and a constraint violation rolls
  the table's insert back instead of dropping rows.
- **Post-import verification.** Preview the rows that landed, per table
  (`components/table-preview-interface.tsx`).
- **Run summary** with measured wall time, records processed, per-table results and a downloadable
  JSON report (`components/results-dashboard.tsx`).
- **Dark mode and appearance settings**: theme presets, table density, sticky headers, zebra rows,
  reduced motion (`app/settings/page.tsx`, `lib/settings.ts`).

## Quick start

Requires Node.js 18 or newer (the `engines` field in `package.json`) and a database server for the
engine you intend to use. SQLite needs only a writable file path.

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

Open <http://localhost:3000>. Appearance settings are at `/settings`.

## Checks

```bash
corepack pnpm check        # pipeline + SQLite assertions against the real modules
corepack pnpm check:types  # tsc over the app and over scripts/
corepack pnpm build        # production build
```

`scripts/check-pipeline.ts` runs a workbook built in memory through parsing, type detection, value
transformation and DDL generation for all four engines. `scripts/check-sqlite.ts` drives `lib/db`
against a throwaway SQLite file: create, insert, preview, introspect, and the rollback on a
constraint violation. Both are described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#verifying-a-change).

## Project structure

```
app/
  layout.tsx                  root layout and providers
  page.tsx                    the seven-stage workflow and its state
  globals.css                 Tailwind v4 entry and theme tokens
  settings/page.tsx           appearance settings
  api/                        the seven POST routes (see docs/API.md)
    test-connection/route.ts
    list-databases/route.ts
    create-database/route.ts
    get-tables/route.ts
    create-table/route.ts
    insert-data/route.ts
    preview-table/route.ts
components/
  workflow-stepper.tsx        the seven stage definitions
  file-upload-zone.tsx        stage 1
  excel-preview.tsx           stage 2
  database-connection-form.tsx
  database-connection-list.tsx
  sheet-selection-interface.tsx
  table-creation-interface.tsx
  table-preview-interface.tsx
  results-dashboard.tsx
  app-settings-provider.tsx
  theme-provider.tsx
  theme-toggle.tsx
  common/                     shared UI primitives (StatCard, StatGrid, LoadingCard,
                              EmptyState, StatusAlert, TableShell, DataTable, ChipButton,
                              PageHeader)
  ui/                         shadcn/ui primitives (button, card, input, select, table,
                              tabs, checkbox, switch, alert, badge, label, progress,
                              scroll-area)
lib/
  types.ts                    every shared domain type
  excel.ts                    parseWorkbooks
  schema.ts                   analyzeColumn, analyzeSheet, name sanitizers, type adaptation
  transform.ts                transformDataRows and date handling
  db/
    dialect.ts                the only per-engine code (quoting, placeholders, DDL, drivers)
    index.ts                  each database operation, written once
  api.ts                      postJson client helper
  http.ts                     jsonRoute server wrapper
  storage.ts                  ConnectionStorage, RunHistory, buildRunResult
  settings.ts                 zustand store for appearance settings
  utils.ts                    cn, errorMessage, formatBytes
docs/
  ARCHITECTURE.md             pipeline, stages, database layer, decisions
  API.md                      the seven routes
  TRACKER.md                  refactor status, limitations, backlog
scripts/
  check-pipeline.ts           parse -> detect -> transform -> DDL assertions
  check-sqlite.ts             real SQLite round trip
```

## Supported databases

| Database | Driver | Default port | Notes |
|----------|--------|--------------|-------|
| PostgreSQL | `pg` | 5432 | `"identifier"` quoting, `$1` placeholders, `id SERIAL PRIMARY KEY` when no primary key is chosen. JSON maps to JSONB. |
| MySQL | `mysql2` | 3306 | `` `identifier` `` quoting, `?` placeholders, `id INT AUTO_INCREMENT PRIMARY KEY`. Inferred types are used as-is. |
| SQL Server | `mssql` | 1433 | `[identifier]` quoting, `@p0` placeholders, `id INT IDENTITY(1,1) PRIMARY KEY`. VARCHAR becomes NVARCHAR, BOOLEAN becomes BIT, DATETIME becomes DATETIME2. |
| SQLite | `sqlite3` | — | The `database` field is a file path. `"identifier"` quoting, `?` placeholders, `id INTEGER PRIMARY KEY AUTOINCREMENT`. Dates and JSON are stored as TEXT. |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pipeline, the stages and the database layer
  fit together, and the decisions behind them.
- [docs/API.md](docs/API.md) — the seven routes, with request bodies, payloads and error shapes.
- [docs/TRACKER.md](docs/TRACKER.md) — what the refactor changed, what has been verified, and the
  known limitations.
