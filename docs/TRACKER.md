# Refactor tracker

Working notes for the cleanup that replaced the map-onto-existing-table flow with a single
"one sheet, one new table" pipeline, for the workspace expansion that followed it, and for the UI
foundation pass after that. Facts only;
the reasoning behind the decisions is in [ARCHITECTURE.md](ARCHITECTURE.md) and
[WORKSPACE.md](WORKSPACE.md).

Paths listed under **Done** as deleted no longer exist — that is what the section records. Every
path named anywhere else in this tracker, and every path in [README.md](../README.md),
[ARCHITECTURE.md](ARCHITECTURE.md), [WORKSPACE.md](WORKSPACE.md) and [API.md](API.md), resolves on
disk.

## Workspace expansion

The app grew from one page to six. The import wizard moved to `/import` unchanged in behaviour;
everything else is new.

### New modules

- [x] `lib/expression.ts` — a hand-written tokenizer, recursive-descent parser and tree-walking
  evaluator. No `eval`, no `new Function`, no reachable global: an expression reads only the columns
  it is handed and calls only the functions in the `FUNCTIONS` table.
- [x] `lib/operations.ts` — the data operation engine (13 operation kinds), row validation of seven
  rule kinds, and the grid↔table conversions (`gridToTableConfig`, `gridToRows`, `gridBytes`).
  `applyOperation` is pure, which is what makes rollback exact.
- [x] `lib/guardrails.ts` — every risk judgement in one place, including SQL classification that
  strips comments and string literals before deciding, so `SELECT 1; DROP TABLE t` is refused.
- [x] `lib/workspace.ts` — the IndexedDB dataset store and the retention policy.
- [x] `lib/export.ts` — CSV, JSON and .xlsx out; workbooks back in via the existing parser.
- [x] `lib/push.ts` — the one path from a browser grid into a database table.
- [x] `lib/toast.ts` — the toast store.

### New pages and components

- [x] `/` dashboard, `/connections` (profiles plus a database explorer), `/data` (datasets),
  `/tables` (Table Studio), and `/settings` extended with guardrails and retention.
- [x] `components/app-shell.tsx` with a collapsible sidebar, a mobile drawer, a `⌘K` command palette
  and animated route transitions. `components/common/nav-items.ts` is the single nav list.
- [x] `components/common/data-grid.tsx` — a virtualized, editable grid: 5,000 rows render 19 DOM
  rows, with a sticky header, drag-to-resize columns, inline editing, row selection and
  flagged-cell highlighting.
- [x] `components/common/confirm-dialog.tsx` — the guardrail gate. A destructive assessment always
  carries a `confirmation` phrase and the confirm button stays disabled until it is typed.
- [x] New Radix wrappers: `dialog`, `alert-dialog`, `dropdown-menu`, `tooltip`, `separator`,
  `popover`, `toast`.

### New database operations

- [x] `getTableStructure`, `alterTable`, `dropTable`, `truncateTable`, `mutateRows`, `runQuery`,
  `createSnapshot`, `listSnapshots`, `restoreSnapshot`, `dropSnapshot`, `copyTable`, `dropDatabase`
  — each written once in `lib/db/index.ts` against the `Dialect` interface.
- [x] `previewTable` gained `offset`, `orderBy` and `direction`; it still accepts a bare number as
  `{ limit }`, so existing callers kept compiling.
- [x] Eight new routes, taking the total from 7 to 15. See [API.md](API.md).
- [x] `Dialect` gained `createTableAsSql` (MSSQL has no CTAS), `insertFromSelectSql`, `pageSql`,
  `limitSql`, `addColumnSql`, `dropColumnSql`, `renameColumnSql`, `changeTypeSql`, `renameTableSql`
  and `registrySql`. `changeTypeSql` returns `null` for SQLite, which has no `ALTER COLUMN`, and the
  rebuild path in `lib/db/index.ts` handles that case.

### Correctness fixed during the expansion

- [x] **`analyzeColumn` stringified its samples.** `distinct` was built with
  `present.map((value) => String(value))`, so a DATE column's samples became
  `Mon Jan 15 2024 05:30:00 GMT+0530 (India Standard Time)` and every consumer depended on a
  localised string. Samples now deduplicate on the text form but keep the original value, and
  `check-pipeline.ts` asserts a Date sample is still a `Date`.
- [x] **`coerceCell` let fractions reach integer columns.** `Number(value)` was applied to every
  numeric type, so casting `12.5` to `INT` produced `12.5`. Integer types now truncate toward zero,
  matching `CAST(x AS INT)`; PostgreSQL would have rejected the value and SQLite would have stored a
  REAL in an INTEGER-affinity column.
- [x] **`useCountUp` could display the wrong number.** The stat-card count-up was driven only by
  `requestAnimationFrame`, which does not fire in a hidden or backgrounded tab, so a card could sit
  at `0` indefinitely instead of the real figure. A settle timeout now guarantees the exact value.
- [x] **`PRAGMA` was classified as a write.** `READ_ONLY_VERBS` had no `pragma` entry, so even
  `PRAGMA table_info('t')` failed the read-only test. Read-only pragmas are now an explicit
  allowlist, because `PRAGMA journal_mode = WAL` does write to the file.
- [x] **One cell formatter.** `formatCellValue` in `lib/utils.ts` is now the only place that decides
  how a stored value reads on screen, so a date cannot render as `YYYY-MM-DD` in one panel and
  `Date.toString()` in another.

### Verified in a browser against a real SQLite file

- [x] Dashboard renders workspace totals, recent runs and empty states; the shell's nav, sidebar
  collapse and `⌘K` palette work.
- [x] Connections: profile test reported `SQLite 3.44.2` and the table count; the Tables tab listed
  `customers` (12 rows), `nopk` (2 rows) and `orders` (450 rows) with correct column counts.
- [x] Table browser: paging footer read `page 1 of 3 · showing rows 1–200`; a header sort produced a
  server-side `ORDER BY` (descending put `order_id 450` first) and reset to page 1.
- [x] Query console: `DROP TABLE orders` was classified destructive with write access off and the run
  button disabled; a `SELECT` returned `5 rows · 0 ms`.
- [x] Datasets: importing a two-sheet workbook created two datasets; a filter showed
  `5 → 2 rows · 6 → 6 columns · 0 cells change` before it was applied; History showed the measured
  effect; Undo restored 5 rows and reset the operation count to 0.
- [x] Table Studio: pulling `orders` paged 450 rows; editing a cell recorded
  `Update order_id 1 · amount → 999.5` as pending; applying it through the guardrail dialog cleared
  the plan, and reading the database file back showed `amount = 999.5`.
- [x] Import wizard end to end: two sheets analysed, one selected, the table renamed to
  `orders_import`, created and inserted, verified in the preview, and the run summary reported
  `5 records`, `1 of 1 sheets`, `1 table affected`. The database file was read back: dates stored as
  `2024-01-15`, booleans as `1`/`0`, the duplicate `customer` header suffixed to `customer_2`, and
  NULLs preserved.

### Earlier cleanup

### Dead route trees removed

- [x] Deleted the 11 flat route directories that sat directly under `app/` (each an
  `app/<name>/route.ts`): `analyzeSheets`, `createTable`,
  `endpoints`, `generateSchema`, `getTables`, `health`, `insertData`, `previewData`,
  `testConnection`, `upload`, `validateData`.
- [x] Deleted the 24 route files under `app/api/` — 23 nested routes plus the bare
  `app/api/route.ts`: `data/import`, `data/insert`,
  `data/insert-clean`, `database/connections`, `database/create-database`,
  `database/create-table`, `database/get-tables`, `database/insert-data`,
  `database/list-databases`, `database/preview-table`, `database/test-connection`,
  `excel/analyze`, `excel/upload`, `files/history`, `schema/generate`, `sheets/analyze`,
  `sheets/select`, `sql/execute`, `sql/generate`, `system/health`, `tables/configure`,
  `tables/create`, `validation/data`.
- [x] 35 endpoints down to 7 live `POST` routes, each one a thin wrapper over `lib/db`
  (`test-connection`, `list-databases`, `create-database`, `get-tables`, `create-table`,
  `insert-data`, `preview-table`). See [API.md](API.md).

### Dead modules removed

- [x] `lib/database-manager.ts` (1503 lines, four copy-pasted dialect implementations) replaced by
  `lib/db/dialect.ts` (one `Dialect` per engine) and `lib/db/index.ts` (each operation written
  once).
- [x] `lib/data-mapper.ts` and `lib/sql-generator.ts` deleted — the map-onto-existing-table and SQL
  generation paths, along with `components/data-mapping-interface.tsx` and
  `components/sql-generation-interface.tsx`.
- [x] The first `lib/workflow-insights.ts` deleted — a readiness-score and recommendation helper that
  scored `sheetsToMap` and the mapping step that no longer exist. A new one, scoring the seven stages
  that do exist, was added later; see **Import execution and guidance** below.
- [x] `lib/operation-tracker.ts` deleted. It contained `generateMockResult()`, which fabricated
  `executionTimeMs`, record counts and warnings from `Math.random()`; the run summary now comes
  from `buildRunResult` in `lib/storage.ts`, built from measured values.
- [x] `lib/data-cleaner.ts`, `lib/data-transformer.ts`, `lib/data-type-detector.ts`,
  `lib/excel-parser.ts` and `lib/connection-storage.ts` deleted, replaced by `lib/schema.ts`,
  `lib/transform.ts`, `lib/excel.ts` and `lib/storage.ts`.
- [x] `lib/app-settings-store.ts` renamed to `lib/settings.ts`.

### Correctness

- [x] **NULL→`''` substitution removed.** The old insert path ran `insertDataWithCleaning` with
  `handleNulls: "default"`, which replaced a NULL in a NOT NULL column with a type-dependent
  default (`0`, `false`, today's date, or `''`) and could skip the whole row. `transformCellValue`
  now maps blank cells to `null`, `insertData` binds them as NULL, and a NOT NULL violation rolls
  the whole batch for that table back rather than dropping rows or inventing placeholder values.
- [x] **Integer-serial→DATE misdetection removed.** The old detector treated any number that landed
  between 1900 and 2100 as an Excel serial date, so quantity and year columns became DATE columns.
  `parseWorkbooks` now reads with `cellDates: true` and `isDateTime` has no numeric fallback at all,
  so a bare number is never a date. A second pass removed the fractional-serial fallback too, which
  had been turning decimal columns into DATETIME columns.
- [x] **Excel time drift rounded away.** Excel stores a time as a fraction of a day, so a
  `17:45:00` cell arrives a millisecond short; `formatDateForDatabase` now rounds to the nearest
  second, and `isDateTime` rounds the same way so a drifted midnight stays a plain date.
- [x] **Partial-failure wedge in table creation fixed.** Every selected sheet is attempted; a
  failure is recorded as a `FailedTable` and the remaining sheets still run. The run status is
  `success`, `partial` or `failed` accordingly, and the failed sheets are surfaced in the summary
  instead of stopping the run.
- [x] **Duplicate header handling added.** `uniqueNames` in `lib/schema.ts` suffixes repeats
  (`region`, `region_2`) instead of letting two columns collide on one name.
- [x] **Fabricated `executionTimeMs` replaced with measured wall time.** The table-creation
  interface times its own create-and-insert loop and passes the elapsed milliseconds to
  `buildRunResult`, so the reported duration is the import, not the time spent reviewing the schema.
  `RunHistory.successRate` was also deleted rather than kept as a percentage over a field that no
  longer exists; the summary reports "sheets imported" as `tablesAffected of sheetsProcessed`.
- [x] **One response convention.** `jsonRoute` (`lib/http.ts`) returns `{ success: true, ...payload }`
  or `{ success: false, message }` with status 500. The old routes returned ad-hoc shapes,
  including `details` blobs and `debug.stack`.
- [x] **Debug output removed.** No `console.log` remains in `app/`, `components/` or `lib/`; the old
  routes logged request bodies, connection configs (passwords included) and stack traces.
- [x] **Type adaptation moved out of the UI.** Columns keep the type the analysis detected and each
  engine's mapping is applied when the DDL is built. Adapting in the editor lost the semantics the
  value transformer needs: SQLite maps `BOOLEAN` to `INTEGER`, and a `yes`/`no` column adapted too
  early was coerced to `null` and rejected by its own `NOT NULL` constraint.
- [x] **SQLite boolean binding.** node-sqlite3 accepts numbers, strings, bigints, buffers and null
  only, so the dialect binds `true`/`false` as `1`/`0`.
- [x] **Saved connections survive a reload.** `app/page.tsx` reads `ConnectionStorage` on mount; the
  rewritten page had dropped that hydration, so the connection list came up empty after a refresh.

### UI

- [x] Common primitives extracted into `components/common/` — `StatCard`, `StatGrid`, `LoadingCard`,
  `EmptyState`, `StatusAlert`, `TableShell`, `DataTable`, `ChipButton`, `PageHeader` — replacing
  hand-rolled stat cards, spinner cards, bordered table wrappers and `bg-green-50`-style alert
  markup across the interfaces.
- [x] `StatusAlert` carries the success/error/warning/info tones, so alert colours are no longer
  hardcoded per component.
- [x] `components/workflow-stepper.tsx` added as the single source of truth for the seven stages;
  the old eight-step description is gone.
- [x] Redundant stat rows removed: the page chrome already reports files, sheets, rows and tables,
  so the preview stage no longer repeats three of them. Preview tables render dates as the value
  that will be stored (`2023-03-04`) instead of `Date.toString()`.
- [x] `components/ui/textarea.tsx` deleted and unused exports removed from `components/ui/*`.

### Dependencies

- [x] 32 unused npm dependencies removed: 19 unused `@radix-ui/*` packages, plus
  `@hookform/resolvers`, `react-hook-form`, `zod`, `cmdk`, `date-fns`, `recharts`, `sonner`,
  `vaul`, `input-otp`, `embla-carousel-react`, `react-day-picker`, `react-resizable-panels` and
  `tailwindcss-animate`. What remains is what the app imports: `next`, `react`, `react-dom`, the
  four drivers, `xlsx`, `zustand`, `next-themes`, `lucide-react`, `clsx`, `tailwind-merge`,
  `class-variance-authority`, `geist`, `autoprefixer`, and the eight `@radix-ui/*` primitives used
  by `components/ui`.
- [x] `package-lock.json` removed; pnpm is the only package manager (`packageManager` in
  `package.json`).

## UI foundation pass

A pass over the visual layer: fonts, colour tokens, placeholder and scrollbar treatment, and the
framework boundaries the app was missing. No pipeline contract changed.

### Fonts

- [x] **`font-mono` never rendered in Geist Mono.** `app/layout.tsx` assigned `GeistSans.variable`
  and `GeistMono.variable` — the class names `next/font` generates — to `--font-sans` and
  `--font-mono` inside an inline `<style>`. A class name is not a font family, so every `font-mono`
  element (SQL console, table and column names, ids, the `⌘K` hint) fell back to the browser's
  default font. Measured in the browser: a probe string rendered 317.31px, exactly the serif width
  and not the generic monospace width (343.08px), while the `GeistMono` face was `unloaded` — it had
  never been requested.
- [x] **One font source.** The generated classes now sit on `<html>`, the inline `<style>` is gone,
  and `@theme inline` maps `--font-sans: var(--font-geist-sans)` / `--font-mono: var(--font-geist-mono)`,
  which is what `font-sans`, `font-mono` and preflight's `--default-font-family` read. The same probe
  now measures 374.41px — the Geist Mono width — and both faces report `loaded`.

### Colour tokens

- [x] **Placeholders read as real text.** Light `--muted-foreground` was `oklch(0.35 0 0)`, the exact
  value of `--foreground`, and `placeholder:text-muted-foreground` is what every input uses, so a
  placeholder was indistinguishable from an entered value. It is now `oklch(0.52 0 0)` — 5.51:1 on
  white, a full step lighter than `--foreground`. Tailwind's preflight already sets
  `::placeholder { opacity: 1 }`, so the token was the whole bug.
- [x] **Input borders were invisible in light mode.** `--input` was `oklch(1 0 0)`, i.e. the page
  background, so inputs and the unchecked switch track had no boundary at all. It is now
  `oklch(0.78 0 0)` (2.0:1 on white). `--border` is untouched, so panels and dividers keep their
  weight.
- [x] **Focus rings rendered at a quarter strength.** `--ring` carried its own `/ 0.5` and every
  utility (`ring-ring/50`, `outline-ring/50`) applies another 50%. The token is opaque now; the
  utilities own the alpha.
- [x] **`--muted` was equal to `--card`.** Muted surfaces — badges, `kbd`, hover fills, zebra rows —
  were invisible on a card. Light `--muted` is now `oklch(0.955 0 0)`.
- [x] **Selected text was unreadable in dark mode.** `::selection` mixed the primary toward white and
  kept `--foreground`, so dark mode produced near-white text on a pale band. It is now a 35% primary
  tint over whatever surface it lands on, with the same text colour.
- [x] **Every preset failed on its own label.** The presets set `--primary`/`--secondary`/`--accent`
  but not their foregrounds, so they inherited white: solaris at L 0.72 measured 2.44:1, dracula
  3.24:1, warm 3.34:1, ocean 3.40:1, the `light` preset 3.93:1. Each preset now carries the
  foreground its lightness needs — near-black on the bright palettes (4.6:1 to 8:1), white on the
  `light` preset, which was darkened to L 0.55 to clear 4.84:1 — and `light` also gets a dark-mode
  pair (`:root.dark[data-theme-preset="light"]`), because the blue that holds white labels on a light
  page is too dark to read as `text-primary` on the dark one. Defaults: light `--primary` moved
  0.55 → 0.53 (4.19 → 4.53:1 with its white label), `--secondary`/`--accent` keep the orange and take
  near-black labels (3.53 → 5.57:1), `--destructive` moved 0.6 → 0.58 (4.39 → 4.65:1).
- [x] Deliberate ceiling: input borders sit at 2.0:1 in light and 1.44:1 in dark, below the 3:1 WCAG
  1.4.11 asks of essential boundaries. The app's border language is flat — `--border` itself is
  1.6:1 — and clearing 3:1 would mean an input edge darker than every other edge in the UI, which is
  a redesign rather than a fix. The focus ring carries the affordance instead.

### Scrollbars

- [x] No scrollbar styling existed anywhere, so the platform default (a 17px bar with a grey track on
  Windows) sat inside every panel. `html` now sets `scrollbar-width: thin` and
  `scrollbar-color: var(--scrollbar-thumb) transparent`; both properties inherit, so one declaration
  covers every scroll container. The `::-webkit-scrollbar*` pseudo-elements cover the engines that
  ignore the standard properties — Chrome ≥121 applies the standard pair and ignores them, so the two
  spellings are complementary rather than duplicates. The Radix scroll-area thumb in
  `components/ui/scroll-area.tsx` uses the same two tokens.

### Boundaries

- [x] `app/loading.tsx` — a skeleton of the page chrome, rendered inside the shell so the navigation
  stays usable while a segment resolves.
- [x] `app/error.tsx` — route error boundary: message, digest, `reset`, and a link home.
- [x] `app/global-error.tsx` — replaces the document when the root layout fails; it imports nothing
  from the app and uses inline styles, so the failure that took the shell down cannot take this down
  too.
- [x] `app/not-found.tsx` — unknown routes.

### Verified in a browser

- [x] Fonts: the computed `font-family` of a `.font-mono` probe is the Geist Mono stack, its measured
  width (374.41px) matches Geist Mono rather than the serif (317.31px) or generic monospace
  (343.08px) fallbacks, and `document.fonts` reports `GeistSans|loaded` and `GeistMono|loaded` — in
  the production build as well as in dev.
- [x] Tokens: the computed `::placeholder` colour is `oklch(0.52 0 0)` against a value colour of
  `oklch(0.35 0 0)`, the search field's border is `oklch(0.78 0 0)`, and `scrollbar-width`/`scrollbar-color`
  resolve to `thin` and the thumb token, in both light and dark.
- [x] All twelve preset × mode combinations resolve to the intended pair, including the dark-scoped
  `light` preset, read back from the cascade with each `data-theme-preset` value.
- [x] `app/loading.tsx` rendered for real: a temporary route that suspended for six seconds showed
  `aria-busy="true"` and eight skeleton blocks inside a live shell, then the content.
- [x] `app/error.tsx` rendered for real against a temporary route that always threw: `role="alert"`,
  the message, the digest, `Try again` and `Back to dashboard`.
- [x] `app/global-error.tsx` rendered for real against a temporary throw in `app/layout.tsx`: the
  standalone document appeared with no shell around it. Both probe routes were deleted and the throw
  reverted before the build.
- [x] `app/not-found.tsx` renders for an unknown path in dev and in the production build.
- [x] Scrollbar *painting* is not observable here: the managed headless browser uses overlay
  scrollbars, which reserve no layout space and ignore `::-webkit-scrollbar` (measured: the same 0px
  whether `scrollbar-width` is `auto`, `thin` or `none`). The rules are asserted from the served
  stylesheet instead; on such platforms the native overlay bar is the correct result anyway.

## Import execution and guidance

The brief in [UX_SCALABILITY_UPGRADE.md](UX_SCALABILITY_UPGRADE.md) was written against an older tree
(its paths are `/home/runner/work/Ingesta/Ingesta/...`, and its insert route no longer exists). This
is that brief applied to this tree: an execution policy the operator controls, batched inserts with
telemetry at the API boundary, and a guidance layer over the wizard's own state.

### The insert policy

- [x] `lib/import-execution.ts` owns it: `DEFAULT_INSERT_EXECUTION` (500-row batches, NULL blanks,
  empty rows skipped, no trimming, type conversion on, stop at the first failed batch),
  `normalizeInsertExecution` (absent means `batchSize: 0`, i.e. one transaction) and
  `prepareInsertRows` (trim, `blankCells: "skip-row"`, coercion against the column types).
- [x] **A blank cell is never invented into a value.** The removed `handleNulls: "default"` behaviour
  (blank → `0`, `false`, today's date) is not reachable from this policy: a blank stays NULL, or the
  whole row is dropped when the operator asks for that and nothing else.
- [x] `insertDataInBatches` in `lib/db/index.ts` is the only chunking implementation: one session,
  one transaction per chunk, a per-chunk outcome, and `skipEmptyRows` as a parameter of the statement
  builder. That last part matters — the rule that drops trailing blank rows had lived inside
  `insertData`, where it would have overridden the option. `insertData` now delegates with
  `batchSize: 0` and rethrows the first batch error, so its contract (one transaction, throws on
  failure) is byte-for-byte what it was.
- [x] The route normalizes, prepares and reports: `insertedRows`, `skippedRows`, `totalBatches`,
  `processedBatches`, `failedBatches`, `batchErrors`, `warnings`, `durationMs`. A failed batch is a
  500 carrying the same telemetry — `lib/http.ts` gained a `RouteFailure` for exactly that, so a
  partial run can say `1 of 3 batches failed · 2 rows were written · stopped at batch 2 · <engine
  message>` instead of throwing the numbers away.
- [x] `postJson` keeps a failure body as `partial`, and `unwrap` drops it deliberately: a failure body
  is not shaped like the success payload, so picking fields out of it would hand callers half a value.
  `lib/push.ts` forwards `{ ok: false, error }` explicitly for the same reason.

### The wizard

- [x] `components/table-creation-interface.tsx` gained the execution panel — batch size, blank-cell
  handling, four toggles — with a line that states the consequence of the current choice, and sends
  the policy, the column types and the rows with every insert.
- [x] The success message *is* the measurement: `Created "orders_skip" with 1,197 rows · 3 of 3
  batches · 3 skipped · 3.45s. 3 rows skipped because a cell was empty: row 400, row 800, row 1200.`
- [x] `CreatedTable.rowCount` is the inserted count now, not the sheet's row count, so the run summary
  reports what landed (1,197) rather than what was queued (1,200).
- [x] **Dead UI removed.** The per-sheet outcome list lived inside the table step, but the page moves
  to Verify the moment the loop ends and going back re-mounts the component — the list could not be
  reached. The outcomes are `TableCreationOutcome[]` on the page now, rendered at the Verify step
  where the user lands, replacing the failure-only alert that said less.

### Guidance

- [x] `lib/workflow-insights.ts` scores the seven stages that exist: readiness is a weighted milestone
  list (files 10, analysis 15, connection 15, sheets 20, tables 25, recorded run 15), blockers are
  stage-aware plus the two that outrank them (a failed sheet, a busy step), and recommendations come
  from state the page already holds — a queue over 5,000 rows is told to set a batch size.
- [x] `components/workflow-guidance.tsx` renders it; `app/import/page.tsx` builds the snapshot and
  reads the run count from `RunHistory` on mount.

### Verified

- [x] `bun scripts/check-import-execution.ts`, wired into `pnpm check`: policy defaults and clamping,
  trimming, coercion, `skip-row`, and the real route against SQLite — no execution options is one
  transaction that leaves nothing behind after a `NOT NULL` violation; `batchSize: 2` over six rows
  with a bad row in the second batch stops there with 2 rows committed, `totalBatches: 3`,
  `failedBatches: 1`; with `continueOnBatchError` the third batch still lands; `skipEmptyRows: false`
  writes the blank row; guidance scores 0, 25 and 100 for an empty, an analysed and a finished run.
- [x] A real 1,200-row workbook through the browser: uploaded, analysed, imported into a throwaway
  SQLite file with the panel set to `blank cells: skip row` and the default 500-row batches. The
  Verify step reported `1,197 rows · 3 of 3 batches · 3 skipped · 3.45s` and named rows 400, 800 and
  1200; the run summary reported `RECORDS PROCESSED 1,197`; the database file holds 1,197 rows with
  `order_id 400` absent, `amount` stored as REAL (the server-side conversion), and `notes` still
  `"  padded  "` — trimming was off, which is what the panel said it was.

## Verification

- [x] `pnpm check:types` — `tsc --noEmit` over the app and over `scripts/`, zero diagnostics.
- [x] `pnpm build` — production build compiles; the route table is exactly `/`, `/settings` and the
  seven `POST` routes.
- [x] `bun scripts/check-pipeline.ts` — parse, detection, transformation and DDL assertions pass for
  all four engines.
- [x] `bun scripts/check-sqlite.ts` — real SQLite round trip: create, insert (NULLs, booleans, a
  blank row), preview, introspect, `NOT NULL` rollback, duplicate-table error.
- [x] Browser smoke test against the production build with a two-sheet workbook: upload → analyze →
  connect (real SQLite) → select sheets → edit schema → create both tables → verify previews →
  finish run. Both tables created, 5 rows inserted, summary reported 2 of 2 sheets imported.
- [x] The smoke test's output was read back from the database file: `signup_date` stored as
  `2023-03-04`, `ordered_at` as `2024-01-03 17:45:00` (matching the source cell exactly),
  `active` as `1`/`0`, the repeated `name` header as `name_2`, and the primary keys as nominated.
- [x] The partial-failure path was exercised for real: a second run against the same database hit
  `already exists`, the run continued to the verify stage with the failure named, and the summary
  reported it instead of wedging.
- [x] All seven `POST` paths in [API.md](API.md) resolve to an `app/api/<name>/route.ts` file, and
  `app/api/` contains exactly those seven directories.
- [x] Every file path referenced in [README.md](../README.md), [ARCHITECTURE.md](ARCHITECTURE.md)
  and [API.md](API.md) resolves on disk, including every entry of the README project-structure
  tree.
- [x] Every type, function and module name referenced in [ARCHITECTURE.md](ARCHITECTURE.md) is
  declared in `lib/`, `components/` or `app/`.
- [x] The engine differences in the [ARCHITECTURE.md](ARCHITECTURE.md) table were read from
  `lib/db/dialect.ts` and the type overrides in `lib/schema.ts`, not from the old documentation.
- [x] The counts in **Done** (11 flat routes, 24 routes under `app/api/`, 1503 lines of
  `lib/database-manager.ts`, 32 removed dependencies) come from the pre-refactor tree in git.
- [x] No `console.log` in `app/`, `components/` or `lib/` — the only ones left are the two check
  scripts' success lines.

Not covered: the PostgreSQL, MySQL and SQL Server paths were not run against live servers. Their
dialect SQL, DDL and type mappings are asserted in `check-pipeline.ts`, but the drivers themselves
are unexercised.

## Known limitations

Each of these is a deliberate ceiling with a known upgrade path.

- **Introspection issues one `COUNT(*)` per table.** `listTables` in `lib/db/index.ts` counts rows
  per table, so listing a schema with hundreds of tables costs hundreds of round trips. Upgrade:
  read the engine's estimate (`pg_class.reltuples`, `information_schema.tables.table_rows`, a
  SQLite `dbstat` scan), or drop row counts from the connection list entirely.
- **Inserts are one statement per row.** Correct, and atomic per transaction, but not fast: every row
  is a separate round trip. A batch size bounds how much one failure costs — each batch is its own
  transaction — but it does not make the statements multi-row. Upgrade: multi-row
  `INSERT ... VALUES (...), (...)` batches, or the engine's bulk path — `COPY` on PostgreSQL,
  `LOAD DATA` on MySQL, `bulk` on SQL Server, a prepared statement loop for SQLite.
- **Batching trades atomicity for reach.** With a batch size set, batches that already committed stay
  committed when a later one fails. The response reports exactly how many rows landed and which batch
  failed, and the sheet is reported as failed — but the table is left partially filled, and nothing
  rolls those rows back automatically.
- **The whole sheet is held in browser memory and posted as one JSON body.** Large sheets mean a
  large string in the browser and a large request body. Upgrade: chunk the rows across several
  insert calls, or parse the file server-side and stream.
- **A dataset is held in memory while it is open.** `Workspace` stores datasets in IndexedDB and
  lists them without reading rows, but selecting one loads the whole grid, and every operation
  replays over it. The `maxRowsPerDataset` retention limit is what keeps this bounded.
- **Row editing in the Table Studio requires a primary key.** Without one, the studio disables cell
  editing, row deletion and "Add row", and says why. Matching rows on every column instead was
  rejected: a duplicate row would then be silently uneditable or silently overwritten.
- **`_ingesta_` is a reserved table-name prefix.** `listTables` hides those tables so snapshots do
  not appear as user tables. A database that already uses that prefix for its own tables would hide
  them too.
- **Snapshots live inside the database they protect.** Dropping the database takes its snapshots
  with it. That is why `assessDropDatabase` says so explicitly.
- **No resume or retry per table.** A failed sheet is retried by running the workflow again; there
  is no persisted queue of pending tables. Upgrade: persist the per-run queue and retry only the
  `FailedTable` entries.
- **`previewTable` orders only when asked.** Without `orderBy` the engine decides the order, so the
  sample is arbitrary. `totalRows` is an exact `COUNT(*)`, separate from the sample.
- **The expression language is not SQL.** It is deliberately smaller and safer than SQL — no
  subqueries, no joins, no aggregates over the whole column. It exists so a filter can run in the
  browser over data that has not reached a database yet.
- **Connections and run history live in `localStorage`.** Passwords are stored in plain text in the
  browser and sent to the server with each request. Exporting profiles includes them by default,
  behind an explicit warning; there is no encryption.
- **No authentication.** Anyone who can reach the app can use any saved connection, and the server
  process is the one opening database connections.
- **Only SQLite is exercised against a live server.** PostgreSQL, MySQL and SQL Server are asserted
  at the SQL, DDL and type-mapping level by the check scripts; their drivers are never run here.

## Backlog

Only work that follows from the limitations above.

- [ ] Make the insert multi-row once row counts justify it (`VALUES (...), (...)`, or the engine bulk
  API). Batching is in: the rows are already cut into per-batch transactions, so this is the statement
  shape inside a batch, not the transaction boundary.
- [ ] Offer a retry of only the failed batch after a partial insert, instead of leaving the operator to
  re-run the sheet and reconcile the rows that landed.
- [ ] Replace per-table `COUNT(*)` with an estimate, or make row counts opt-in in the connection
  list.
- [ ] Chunk large sheets instead of holding them in memory and posting one body.
- [ ] Per-table retry for `FailedTable` entries, driven by a persisted run record.
- [ ] Move connection secrets out of plain-text `localStorage` if the app is ever exposed beyond a
  trusted machine.
- [ ] Window dataset operations so a dataset larger than the retention limit can still be cleaned.
- [ ] Run the PostgreSQL, MySQL and SQL Server paths against live servers, especially the SQLite
  column-type rebuild's counterparts and the snapshot CTAS on SQL Server.
