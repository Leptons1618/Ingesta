# Ingesta

Ingesta turns Excel workbooks into database tables — and then lets you work on the data on either
side of that boundary.

It is a browser workspace with six pages. Import a workbook through the seven-stage wizard to create
tables. Save database connections and explore what is already inside them. Pull a sheet into a
dataset, clean and validate it without touching a database. Or pull a live table into the Table
Studio, edit its shape and its rows, and apply the changes back — with a snapshot taken first.

## Pages

| Route | What it is for |
|-------|----------------|
| `/` | Dashboard: what the workspace holds, recent runs, and where to go next. |
| `/import` | The seven-stage import wizard. |
| `/connections` | Saved connection profiles, and an explorer for one of them: overview, tables, a SQL console, snapshots. |
| `/data` | Datasets — parsed sheets you can reshape, validate and export without a database. |
| `/tables` | Table Studio — pull a live table, edit columns and rows, review the plan, apply it. |
| `/settings` | Appearance, guardrails and data retention. |

## The import workflow

Seven stages, in order. `components/workflow-stepper.tsx` holds the list, `app/import/page.tsx`
drives it.

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

### Import

- **Multi-file, multi-sheet import.** Drag and drop or browse; every selected sheet becomes its own
  table (`components/file-upload-zone.tsx`, `lib/excel.ts`).
- **Type inference per column** (`lib/schema.ts`): BOOLEAN, DATE/DATETIME, TINYINT/SMALLINT/INT/
  BIGINT, DECIMAL, VARCHAR/TEXT, JSON, with per-engine adaptation for PostgreSQL, MySQL, SQL Server
  and SQLite.
- **Editable schema before creation.** Rename the table and its columns, change types, toggle
  nullability, add or drop a column, and choose the primary key
  (`components/table-creation-interface.tsx`).
- **Duplicate header labels are disambiguated** rather than dropped: two `region` headers become
  `region` and `region_2`.
- **Import execution controls** (`lib/import-execution.ts`): batch size, what a blank cell becomes,
  empty-row skipping, text trimming, type conversion and continue-after-failed-batch. They are sent
  with the insert and reported back per sheet — rows, batches, skipped rows, duration.
- **One transaction per table's rows** by default. NULL is preserved as NULL, and a constraint
  violation rolls the table's insert back instead of dropping rows. With a batch size set, each batch
  commits on its own, so a failure costs only its own rows — and the response says exactly which
  batch failed and how many rows had landed.
- **Partial failure is reported, not hidden.** A sheet that fails is named in the run summary and the
  remaining sheets still run.
- **Workflow guidance** (`lib/workflow-insights.ts`): readiness, the blocker for the current stage,
  and recommendations — all derived from the state the wizard already holds.

### Connections and the database explorer

- **Saved profiles** with pinning, duplication, editing and per-profile test
  (`components/connections/*`).
- **Import and export of profiles as JSON**, with or without passwords, and an explicit warning when
  the export contains them.
- **Table browser** with server-side paging and sorting, and per-table actions: rename, truncate,
  drop, snapshot, export the current page.
- **SQL console** that shows its verdict before it runs — risk level, warnings, and the reason a
  statement is refused. Write access is off by default.
- **Snapshots** listed per table, restorable and droppable.

### Datasets

- **Import any workbook or CSV** into a dataset, one per sheet, stored in IndexedDB so it survives a
  reload.
- **Operations**: filter, derive a column, rename, drop, keep, reorder, cast, fill blanks, dedupe,
  sort, trim, find and replace, limit. Each one reports the rows, columns and cells it changed.
- **Custom functions** for filters, derived columns and validation rules — a small safe expression
  language (`lib/expression.ts`) with text, number, logic, conversion and date functions.
- **Validation rules** of seven kinds with severities, findings grouped by rule, and flagged cells
  highlighted in the grid.
- **Operation history with rollback to any point.** A dataset is its source grid plus an ordered
  operation list, so rolling back is truncating the list and replaying — exact, not approximate.
- **Export to CSV, JSON or .xlsx**, or push straight into a database table.

### Table Studio

- **Pull a live table** into an editable grid with server-side paging.
- **Edit cells, delete rows, add rows**, and change the shape: add, rename, retype, drop and reorder
  columns.
- **A pending-changes plan.** Nothing is written until you review the plan and apply it, and every
  change can be discarded individually or wholesale.
- **Guardrail assessment before applying**, with the worst risk across all pending changes and every
  warning listed. A snapshot is taken first when that setting is on.
- **Save as** a new table, append to an existing one, or replace its contents.
- **Row editing requires a primary key.** A table without one disables row editing and says why,
  rather than guessing at row identity.

### Guardrails and retention

- **One classifier for risk** (`lib/guardrails.ts`). Dropping a table, truncating it, dropping a
  column, deleting rows and replacing a table's contents are all classified in one place, and the
  destructive ones require the object's name to be typed back.
- **SQL is classified after comments and string literals are removed**, so `SELECT 1; DROP TABLE t`
  cannot pass as read-only.
- **Retention limits** for datasets, rows per dataset, run history, snapshots per table and dataset
  age — editable in Settings, enforced in code, and reported rather than applied silently.
- **Snapshots are real tables** (`_ingesta_snap_*`) with a registry, so they are portable across all
  four engines and visible to any other tool that can open the database.

### Interface

- Persistent sidebar with a mobile drawer, a `⌘K` command palette, and animated route transitions.
- A virtualized data grid — 50,000 rows scroll smoothly — with a sticky header, drag-to-resize
  columns, inline editing, row selection and flagged-cell highlighting.
- Theme presets, table density, sticky headers, zebra rows, compact cards and a reduce-motion switch.

## Quick start

Requires Node.js 18 or newer (the `engines` field in `package.json`) and a database server for the
engine you intend to use. SQLite needs only a writable file path.

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

Open <http://localhost:3000>. Appearance, guardrails and retention are at `/settings`.

### If the dev server returns 500 with `a[d] is not a function`

Stop every running Next process and clear the build directory:

```bash
corepack pnpm clean
corepack pnpm dev
```

`.next` is shared by `next dev`, `next build` and `next start`, and it holds the route and chunk
manifests. **Two Next processes writing it at once corrupt each other**, and the failure is not
obvious: a request can fall through to `/_not-found` (a 404 on a route that exists), or the webpack
runtime can fail to find a module factory and throw `a[d] is not a function` with a digest. Both are
the same cause. Run one Next process per working copy at a time, and `pnpm clean` whenever you
switch between `dev`, `build` and `start` after an interrupted run.

## Checks

```bash
corepack pnpm check        # seven assertion scripts against the real modules
corepack pnpm check:types  # tsc over the app and over scripts/
corepack pnpm build        # production build
```

| Script | What it proves |
|--------|----------------|
| `check-pipeline.ts` | Parse → detect → transform → DDL for all four engines, plus sample-value typing. |
| `check-workspace.ts` | Expressions, every operation, replay-equals-incremental, exact rollback, validation, guardrail classification, CSV quoting. |
| `check-data.ts` | The `/data` round trip: import → filter/derive/sort → effect counts → rollback → export. |
| `check-table-ops.ts` | Real SQLite: structure, paging, alter, the column-type rebuild, row mutations, snapshots, query guard. |
| `check-tables.ts` | The Table Studio plan: ordering, payload shapes, guardrail gates, partial failure, keyless tables. |
| `check-sqlite.ts` | Real SQLite round trip: create, insert, preview, introspect, `NOT NULL` rollback. |
| `check-import-execution.ts` | The insert policy and the guidance layer, plus the real route: one transaction without execution options, one per batch with them, partial-commit telemetry. |

Details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#verifying-a-change) and
[docs/WORKSPACE.md](docs/WORKSPACE.md#verifying-a-change).

## Project structure

```
app/
  layout.tsx                  root layout, providers, the app shell, next/font wiring
  page.tsx                    dashboard
  globals.css                 Tailwind v4 entry, theme tokens and motion
  loading.tsx                 route-level loading skeleton
  error.tsx                   route error boundary
  global-error.tsx            last-resort boundary when the shell itself fails
  not-found.tsx               404 for unknown routes
  import/page.tsx             the seven-stage workflow and its state
  connections/page.tsx        connection profiles and the database explorer
  data/page.tsx               datasets: operations, validation, export
  tables/page.tsx             table studio: pull, edit, apply
  settings/page.tsx           appearance, guardrails, retention
  api/                        the fifteen POST routes (see docs/API.md)
components/
  app-shell.tsx               sidebar, mobile drawer, route transitions
  command-palette.tsx         ⌘K navigation
  toaster.tsx                 toast host
  connection-select.tsx       shared connection picker
  expression-field.tsx        expression input with live validation
  workflow-stepper.tsx        the seven stage definitions
  workflow-guidance.tsx       readiness, blockers and recommendations panel
  file-upload-zone.tsx        stage 1
  excel-preview.tsx           stage 2
  database-connection-form.tsx / database-connection-list.tsx
  sheet-selection-interface.tsx / table-creation-interface.tsx / table-preview-interface.tsx
  results-dashboard.tsx
  connections/                profile list, editor, explorer, table browser, query console, snapshots
  data/                       dataset list, grid, operations, history, validation, export
  tables/                     selection bar, pending changes, column editor, snapshots, save as
  common/                     DataGrid, ConfirmDialog, RiskBadge, Toolbar, Section, MiniBars,
                              StatCard, StatGrid, EmptyState, LoadingCard, StatusAlert,
                              TableShell, DataTable, ChipButton, PageHeader, nav items
  ui/                         Radix wrappers: button, card, input, select, dialog, alert-dialog,
                              dropdown-menu, popover, tooltip, separator, toast, table, tabs,
                              checkbox, switch, alert, badge, label, progress, scroll-area
lib/
  types.ts                    every shared domain type
  excel.ts                    parseWorkbooks
  schema.ts                   analyzeColumn, analyzeSheet, name sanitizers, type adaptation
  transform.ts                coerceCell, transformDataRows and date handling
  import-execution.ts         the insert batching policy: defaults, blank/trim/convert rules
  workflow-insights.ts        readiness, blockers and recommendations for a run
  expression.ts               the safe expression language
  operations.ts               the data operation engine, validation, grid↔table conversion
  guardrails.ts               risk classification for every destructive action
  workspace.ts                the IndexedDB dataset store and retention
  push.ts                     writing a grid into a database
  export.ts                   CSV, JSON and .xlsx out; workbooks back in
  db/
    dialect.ts                the only per-engine code (quoting, placeholders, DDL, drivers)
    index.ts                  each database operation, written once
  api.ts                      the typed client over the routes
  http.ts                     jsonRoute server wrapper
  storage.ts                  ConnectionStorage, RunHistory, buildRunResult
  settings.ts                 zustand store for appearance, guardrails and retention
  toast.ts                    toast store
  utils.ts                    cn, errorMessage, formatBytes, newId, formatters
docs/
  ARCHITECTURE.md             pages, pipeline, database layer, decisions
  WORKSPACE.md                datasets, operations, expressions, guardrails, snapshots, retention
  API.md                      the fifteen routes
  TRACKER.md                  status, limitations, backlog
  UX_SCALABILITY_UPGRADE.md   the brief behind the execution controls and the guidance panel
scripts/
  check-pipeline.ts  check-workspace.ts  check-data.ts
  check-table-ops.ts  check-tables.ts  check-sqlite.ts  check-import-execution.ts
```

## Supported databases

| Database | Driver | Default port | Notes |
|----------|--------|--------------|-------|
| PostgreSQL | `pg` | 5432 | `"identifier"` quoting, `$1` placeholders, `id SERIAL PRIMARY KEY` when no primary key is chosen. JSON maps to JSONB. |
| MySQL | `mysql2` | 3306 | `` `identifier` `` quoting, `?` placeholders, `id INT AUTO_INCREMENT PRIMARY KEY`. Inferred types are used as-is. |
| SQL Server | `mssql` | 1433 | `[identifier]` quoting, `@p0` placeholders, `id INT IDENTITY(1,1) PRIMARY KEY`. VARCHAR becomes NVARCHAR, BOOLEAN becomes BIT, DATETIME becomes DATETIME2, and CTAS uses `SELECT * INTO`. |
| SQLite | `sqlite3` | — | The `database` field is a file path. `"identifier"` quoting, `?` placeholders, `id INTEGER PRIMARY KEY AUTOINCREMENT`. Dates and JSON are stored as TEXT, and a column type change is a table rebuild. |

Only SQLite is exercised against a live database in this repository. The other three are asserted at
the SQL, DDL and type-mapping level; their drivers are not run.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the pages, the pipeline and the database layer
  fit together, and the decisions behind them.
- [docs/WORKSPACE.md](docs/WORKSPACE.md) — the data model: grids, operations, the expression
  language, guardrails, snapshots and retention.
- [docs/API.md](docs/API.md) — the fifteen routes, with request bodies, payloads and error shapes.
- [docs/TRACKER.md](docs/TRACKER.md) — what has been verified, and the known limitations.
