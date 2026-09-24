# Ingesta user guide

Ingesta is a browser workspace for moving spreadsheet data into a database and working on the data
before and after it arrives. This guide follows the six pages in the order most people use them.

## Before you start

You need Node.js 20 or newer, pnpm, and a database reachable from the app. SQLite needs only a
writable file path. PostgreSQL, MySQL, and SQL Server need their server credentials and network
access.

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

Open `http://localhost:3000`. The sidebar is the primary navigation. On a narrow screen, use the
menu button in the top bar. Press `Ctrl+K` on Windows/Linux or `⌘K` on macOS to open the page
search.

## 1. Dashboard — `/`

The dashboard answers three questions:

- What is stored in this browser? Connections, datasets, rows, and imported totals appear as cards.
- What happened recently? Recent import runs show status, table count, row count, and age.
- What should I do next? Use the four quick actions for Import, Connections, Data, or Table Studio.

The first visit is intentionally empty. Create a connection or import a workbook; the dashboard
fills from those actions. Workspace data is browser-local. Clearing site data removes connections,
run history, settings, and datasets from this browser.

## 2. Import workbooks — `/import`

The import page is a seven-stage workflow. The stepper and guidance panel show the current stage,
readiness, blockers, and the next useful action.

### Stage 1 — Upload

Drag `.xlsx` or `.xls` files into the upload area, or browse from disk. Ingesta reports files it
cannot read and continues with readable files. Select **Analyze files** only after at least one
file is listed.

### Stage 2 — Preview

Review each workbook and sheet. The caption states how many rows and columns are shown. Switch
between files and sheets before continuing. Blank cells are shown as the grid's em dash; they are
not silently converted to text values.

### Stage 3 — Database

Choose a saved connection, or open the create dialog. A connection must be tested before it can be
saved. For a local database, the **This machine** tab probes the default ports and lists SQLite
files in the working directory. A reachable port proves only that a service answered; the
credentials still need to be tested.

Choose the target database in the tree. Databases expand to their tables, and a database can be
created from the same tree. Select **Continue to sheets** after a database is selected.

### Stage 4 — Sheets

Select the sheets that should become tables. Each selected sheet is imported as a new table; this
wizard does not map a sheet onto an existing table. Search by file or sheet name when the workbook
has many sheets.

### Stage 5 — Tables

For every selected sheet:

1. Check the table name and inferred column types.
2. Rename table or column names when needed.
3. Set nullability and choose a primary key.
4. Review the execution policy.

Execution controls are explicit:

- **Batch size** bounds the rows in one transaction. `0` means one transaction for the whole table.
- **Blank cells** either remain `NULL` or cause the row to be skipped. Ingesta never invents `0`,
  `false`, or today's date for a blank.
- **Skip empty rows** removes rows whose cells are all blank.
- **Trim strings** removes surrounding whitespace.
- **Convert types** coerces values to the configured column types.
- **Continue after a failed batch** lets later batches run after an earlier batch fails.

Select **Create tables and insert rows**. A failed sheet is named; other sheets continue. A partial
insert reports how many rows landed, which batch failed, and the skipped rows. The Verify stage
shows the actual inserted row count rather than only the queued count.

### Stage 6 — Verify

Review the created tables and their previews. Go back to Tables to correct the schema or execution
policy, or continue to the run summary.

### Stage 7 — Done

The run summary reports status, files, sheets, tables, rows, and measured duration. Download the
JSON report when you need an audit record. **Start new import** returns to an empty workflow.

## 3. Connections — `/connections`

### Save a profile

Select **New connection**, choose SQLite or a server engine, fill the fields, test the connection,
and save it. A profile is kept in browser `localStorage`; a password is included in the saved
profile unless you export without passwords.

### Manage profiles

The left list supports search, pin, duplicate, edit, test, and remove. Import/export uses a JSON
backup:

- Merge keeps existing profiles and adds or updates incoming IDs.
- Replace discards existing profiles and requires confirmation.
- Export without passwords is the safer default.
- Export with passwords writes plain-text credentials into the file.

### Explore a database

Select a profile to open its explorer:

- **Overview** tests the connection and shows server details.
- **Tables** lists tables, row counts, structure, paging, sorting, and actions such as snapshot,
  rename, truncate, and drop.
- **Query** runs one statement. The safety assessment appears before execution. Write access is off
  by default; enable it in Settings only when the statement is intentional.
- **Snapshots** lists database-side copies for the connected tables. Restore replaces the source
  rows in a transaction.

## 4. Data — `/data`

Data is a browser workspace for cleaning and validating workbook sheets without a database.

### Import and manage datasets

Import `.xlsx`, `.xls`, or `.csv` files. Each sheet becomes a dataset stored in IndexedDB. Use
search, rename, duplicate, delete, prune, and clear-all actions. The retention limit in Settings
truncates an over-limit sheet and reports the number of dropped rows.

### Grid

The Grid tab shows the current grid with search, sorting, hidden columns, and validation highlights.
Before any operation has run, source cells can be edited. After an operation exists, use Operations
or rollback to change the dataset.

### Operations

Choose an operation, fill its fields, and review the measured preview before applying it:

- Filter with a safe expression.
- Derive a column from an expression.
- Rename, drop, keep, or reorder columns.
- Cast a column to another type.
- Fill blanks with a value, mean, median, mode, forward, or backward value.
- Deduplicate, sort, trim, replace, and limit rows.

Operations are recorded. History can roll back to any point by truncating and replaying the
operation list, so rollback is exact.

### Validate

Add rules for required values, uniqueness, ranges, patterns, expressions, lengths, and types. A
blank is only a `notNull` failure; optional blanks do not fail every other rule. Findings are
grouped by rule, highlighted in the grid, and exportable as CSV.

### Export

Download the current grid as CSV, JSON, or `.xlsx`, or push it to a saved database connection.
Choose create, append, or replace explicitly. Replace is destructive and uses the same guardrails as
Table Studio.

## 5. Table Studio — `/tables`

### Open a table

Choose a connection and table. Table Studio fetches one page at a time. Click a column header to
sort server-side. Use the page controls to move through the table.

A table without a primary key cannot have cells, rows, or inserts edited. This is deliberate:
matching every column could silently change the wrong duplicate row. Column changes, export, and
Save as remain available.

### Make a plan

Use **Edit columns** for add, rename, retype, drop, and reorder changes. Edit cells with double-click,
`Enter`, or `F2`; commit with `Enter` or blur, cancel with `Escape`. Add and delete rows from the
toolbar and row action menu.

The Pending panel shows every change, its effect, and the guardrail assessment. Nothing is written
until **Apply changes** is confirmed. A failed step leaves later steps pending so they can be
reviewed and retried.

### Apply safely

When a destructive plan is applied, Ingesta can take a database snapshot first. The Settings
snapshot limit is applied per source table; creating a new snapshot trims the oldest copies for that
table. Use Restore to return to a snapshot, with the same typed confirmation guardrail.

### Export and save as

Export the current page as CSV, JSON, or `.xlsx`. Save as creates a new table, appends to an existing
table, or replaces its contents. Replacing creates a safety snapshot first when enabled.

## 6. Settings — `/settings`

Settings changes apply immediately and persist in this browser.

- **Theme and color preset** changes light/dark/system mode and palette.
- **Table preferences** changes density, sticky headers, zebra rows, and compact cards.
- **Guardrails** controls typed confirmation, automatic safety snapshots, SQL write access, and
  rows fetched per page.
- **Data retention** limits datasets, rows per dataset, run history, snapshots per table, and age.
  **Prune now** reports what it removed.
- **Delete all datasets** and **Clear run history** are irreversible browser-storage actions.
- **Reduce motion** disables non-essential animation.
- The storage card reports current dataset, row, byte, and run totals.

## Safety and recovery

### A destructive action asks for confirmation

When required, type the exact object name shown by the dialog. Turning off typed confirmation keeps
the warning but removes the typed step. Never disable it on a shared machine unless the connection
itself is trusted.

### A connection cannot be reached

Check the host, port, database, username, password, SSL, and server availability. **This machine**
detects only local ports. Test again after fixing the configuration. Saved profiles are not
repaired automatically.

### A table is missing a primary key

Use column changes only, or add a primary key in the source database. Ingesta will not guess row
identity from duplicate values.

### A dataset is larger than the retention limit

Ingesta truncates the imported sheet to the configured limit and reports the number of dropped
rows. Increase the limit in Settings before importing if the full sheet is required.

### A query is refused

Read the safety assessment. Multi-statement input, destructive SQL, and writes while write access
is off are refused. The console never silently rewrites the statement.

### Browser storage is unavailable

Use the error shown by the page. Private browsing, blocked storage, and quota limits can prevent
connections, settings, or datasets from persisting. Export a connection backup without passwords
before clearing site data.

## Keyboard reference

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `⌘K` | Open page search |
| `Arrow` keys | Move through command-palette results |
| `Enter` | Open the active page or confirm a focused action |
| `Escape` | Close a dialog or palette |
| `Enter` / `F2` in a grid cell | Start inline editing |
| `Escape` in an editor | Cancel the edit |
| `Tab` in an editor | Commit and move to the next cell |

## Where data lives

- Connections, run history, and settings: browser `localStorage`.
- Datasets: browser IndexedDB.
- Snapshots: real tables in the connected database, under the reserved `_ingesta_` prefix.
- Workbook contents: held in browser memory while a file is parsed or edited.

Ingesta has no authentication. Anyone who can reach the app can use its saved connections. Run it
only on a trusted machine or trusted network.
