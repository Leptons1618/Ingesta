# The browser workspace

How data is held, changed, validated and written back — the layers that sit between a parsed
workbook and a database table.

The import wizard in [ARCHITECTURE.md](ARCHITECTURE.md) is one-shot: parse, infer, create, insert.
The workspace is the other half of the app. It keeps data around long enough to clean it, check it,
reshape it and write it wherever the user wants, and it keeps a record of every change so any of
them can be taken back.

## The grid is the unit of data

Everything downstream of the parser speaks one shape, declared in `lib/types.ts`:

```ts
GridColumn { name, type, nullable, isPrimaryKey?, defaultValue? }
Grid       { columns: GridColumn[], rows: unknown[][] }
```

`type` is always a **semantic** type — `VARCHAR(100)`, `DECIMAL(10,2)`, `DATE`, `BOOLEAN`. No layer
above `lib/db/dialect.ts` knows what engine will eventually receive the data, so no layer above it
stores an engine-specific type name. `adaptTypeForDatabase` applies the mapping at the moment the
DDL is built.

Rows are positional: `row[i]` belongs to `columns[i]`. A `Grid` therefore has no way to express a
misaligned row, and every operation that changes columns rebuilds the rows in the same pass.

## Operations are values, not actions

An operation is a plain, serialisable object — a discriminated union in `lib/types.ts`:

| Kind | What it does |
|------|--------------|
| `filter` | Keeps rows where an expression is true |
| `derive` | Adds a computed column |
| `rename` | Renames a column |
| `drop` / `keep` | Removes named columns, or everything except them |
| `reorder` | Reorders columns |
| `cast` | Converts every value in a column to another type |
| `fill` | Replaces blanks with a value, a statistic, or the neighbouring value |
| `dedupe` | Keeps the first row per key |
| `sort` | Orders rows by one column |
| `trim` | Strips whitespace |
| `replace` | Finds and replaces inside one column, literally or by regex |
| `limit` | Truncates to the first N rows |

`applyOperation(grid, operation)` in `lib/operations.ts` is a **pure function**: it never mutates its
input and returns `{ grid, effect, findings? }`. `effect` is measured, not estimated — `rowsIn`,
`rowsOut`, `cellsChanged`, `columnsIn`, `columnsOut` are all counted while the operation runs, and
that is what the history list displays.

### Rollback is replay, not undo

A dataset is stored as its **base grid plus an ordered list of operations**
(`lib/workspace.ts`, the `DatasetRecord`). The grid a user sees is
`datasetGrid(dataset)` — the base with every operation replayed.

That makes rollback trivial and exact. Rolling back to entry *k* truncates the list to *k* entries
and replays. There is no reverse operation to write, no accumulated floating-point drift, and no
state that can disagree with the list. `scripts/check-workspace.ts` asserts the property that makes
this safe: replaying from the base produces exactly the same grid as applying the operations one at
a time, and truncating the list produces exactly the state after *k* operations.

The cost is that a rollback re-runs up to *k* operations. That is the right trade for grids that fit
in a browser, and it is why appending a new operation uses the incremental path instead
(`applyOperation` on the current grid) while rolling back uses the replay path.

## The expression language

Filters, derived columns and `expression` validation rules all share one small language,
implemented in `lib/expression.ts`.

It is a hand-written tokenizer, recursive-descent parser and tree-walking evaluator. There is no
`eval`, no `new Function`, and no reachable global: an expression can read only the columns it is
handed and call only the functions in the `FUNCTIONS` table. That is what makes it safe to run text a
user typed.

- **Columns** are referenced by name (`amount`), case-insensitively, or wrapped in square brackets
  (`[Order Total]`) when the header contains spaces or punctuation.
- **Literals** are numbers, single- or double-quoted strings, `TRUE`, `FALSE` and `NULL`.
- **Operators**, loosest to tightest: `OR`, `AND`, `NOT`, `= != < <= > >= LIKE ILIKE IN IS [NOT] NULL`,
  `+ - ||`, `* / %`, unary `-`. `CASE WHEN … THEN … ELSE … END` is supported.
- **Functions** cover text, number, logic, conversion and date work. `EXPRESSION_FUNCTIONS` is the
  single list, and the editor renders it directly, so the help panel cannot drift from the
  implementation.

Null handling is deliberately simple and documented in the module: arithmetic against null yields
null, comparisons against null are false, and `AND`/`OR` treat null as false. `LIKE` matches the raw
cell — it does not trim — which is why `TRIM(name) LIKE 'A%'` is the idiomatic form.

`compileExpression` throws `ExpressionError` with a position and a message that is safe to show.
`validateExpression` wraps it into `{ ok: true, columns } | { ok: false, error }`, and the editor
uses that exact call, so a green field means the operation will run rather than merely that the
syntax looks plausible.

## Validation is separate from transformation

Validation never changes the grid. `validateGrid(grid, rules)` reads it and returns
`ValidationFinding[]`; `findingsByCell` turns those into the `"${row}:${columnIndex}"` map the grid
renders.

Rules are declared per column and carry a severity, so a broken dataset can be described rather than
merely rejected:

| Kind | Fails when |
|------|-----------|
| `notNull` | The cell is blank |
| `unique` | The value appeared in an earlier row (the message names that row) |
| `range` | The value is outside `min`/`max` |
| `pattern` | The value does not match a regular expression |
| `expression` | An expression over the whole row is not true |
| `length` | The text is shorter or longer than the bounds |
| `type` | The value does not parse as the named type |

**Blank cells are not range, pattern, length or type failures.** That is what `notNull` is for. A
nullable column with a gap reports the gap once, not once per rule, and
`scripts/check-workspace.ts` pins that behaviour.

`suggestedRules(grid)` seeds the editor from the grid's own metadata — `notNull` for every
non-nullable column, `unique` for the primary key.

## Guardrails are one classifier, not scattered checks

`lib/guardrails.ts` holds every judgement about how dangerous an action is. Nothing in it blocks
anything by itself: each function returns a `GuardrailAssessment`:

```ts
{ risk: "safe" | "caution" | "destructive", title, summary, warnings: string[], confirmation? }
```

`confirmation` is the phrase the user must type verbatim. It is only ever set on a destructive
assessment, and `ConfirmDialog` refuses to enable its confirm button until the typed text matches.
Because the judgement lives in one module, dropping a table is classified the same way whether it is
triggered from the table browser, the table studio or a snapshot restore.

Two classifications are worth calling out because they are easy to get wrong:

- **`DELETE FROM t` and `UPDATE t SET …` with no `WHERE` escalate from `caution` to `destructive`**
  and demand the typed phrase. Without the clause the statement affects every row, which is a
  different decision from the one the user thought they were making.
- **SQL is classified after comments and string literals are removed.** `SELECT 1; DROP TABLE t`
  is refused for holding two statements; `SELECT 1 -- ; DROP TABLE t` is a single read-only
  statement. `PRAGMA` is read-only only for an allowlisted set of names, because `PRAGMA
  journal_mode = WAL` writes to the database file.

## Snapshots are tables

A snapshot is not a file, a dump or an in-memory copy. It is a real table in the same database:

- a registry table `_ingesta_snapshots` (`name`, `source_table`, `row_count`, `created_at`), created
  on demand;
- a data table `_ingesta_snap_<source>_<yyyyMMddHHmmss>` holding a copy of the rows, created with the
  engine's CTAS form — `SELECT * INTO` on SQL Server, which has no `CREATE TABLE … AS SELECT`.

Restoring deletes the source's rows and re-inserts from the snapshot inside one transaction, so the
table is never observably half-restored. Because a snapshot is a table, it is portable across all
four engines with no per-engine code beyond the CTAS statement, and it is visible to any other tool
that can open the database.

Two consequences worth knowing:

- `listTables` excludes anything named `_ingesta_*`, so snapshots and the registry never appear as
  user tables in the explorer.
- Snapshots live inside the database they protect. Dropping the database takes them with it, which
  is why `assessDropDatabase` says so explicitly.

## Where the browser keeps things

| Data | Store | Why |
|------|-------|-----|
| Datasets | IndexedDB (`lib/workspace.ts`) | A single sheet blows past the ~5 MB `localStorage` budget |
| Connections | `localStorage` (`ConnectionStorage`) | Tiny, and read synchronously while a page renders |
| Run history | `localStorage` (`RunHistory`) | Same |
| Preferences, retention, guardrails | `localStorage` (`useAppSettingsStore`) | Same |

Datasets are listed as `DatasetSummary` — row counts, sizes and operation counts — without the rows
ever leaving IndexedDB, so the dashboard and the dataset list stay cheap regardless of how much is
stored.

### Retention

`RetentionPolicy` is user-editable in Settings and enforced in code:

| Limit | Enforced by |
|-------|-------------|
| `maxDatasets` | `Workspace.prune` — oldest first |
| `maxRowsPerDataset` | `Workspace.clampRows`, at import time |
| `maxRunHistory` | `RunHistory.record` / `RunHistory.trim` |
| `maxSnapshotsPerTable` | the snapshot path |
| `datasetTtlDays` | `Workspace.prune` — by `updatedAt`, `0` disables it |

`Workspace.prune` returns what it removed, and the UI reports it. Retention never deletes silently.

## Writing a grid back

`pushGrid` (`lib/push.ts`) is the single path from a browser grid to a database table, in three
modes:

- **create** — builds a `TableCreationConfig` from the grid with `gridToTableConfig`, creates the
  table, then inserts;
- **append** — inserts into an existing table;
- **replace** — deletes the table's rows, then inserts.

Every cell passes through `gridToRows` first, which coerces it to the type its column declares. That
is the same `coerceCell` the importer uses, so a value written from the grid and a value written by
the wizard land identically. Integer columns truncate toward zero, matching `CAST(x AS INT)`: a
fractional value must never reach an integer column, because PostgreSQL rejects it and SQLite would
silently store a REAL in an INTEGER-affinity column.

If the table is created but the rows are rejected, the error says so explicitly rather than
reporting a plain failure — the user has to decide whether to drop the empty table or fill it.

## Verifying a change

```bash
bun scripts/check-workspace.ts    # expressions, operations, rollback, validation, guardrails, export
bun scripts/check-table-ops.ts    # real SQLite: structure, paging, alter, mutate, snapshots, query
```

`check-workspace.ts` builds grids in memory and asserts the invariants above: operator precedence,
null semantics, every operation's effect counts, that replay equals incremental application, that
rollback is exact, that blanks are not range failures, that a semicolon inside a string literal is
not a statement separator, and that CSV quoting round-trips.

`check-table-ops.ts` drives `lib/db` against a throwaway SQLite file and asserts the database-side
behaviour: paging and ordering, the SQLite column-type rebuild, row mutations and their affected
counts, snapshot create/restore/drop, and that the query guard refuses a second statement.

Both are wired into `pnpm check`. PostgreSQL, MySQL and SQL Server have no live server in this
environment: their dialect SQL, DDL and type mappings are asserted by `check-pipeline.ts` and
`check-table-ops.ts`, but the drivers themselves are not exercised.
