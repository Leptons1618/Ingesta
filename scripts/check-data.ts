/**
 * Dataset explorer self-check.
 *
 * Runs the real modules the `/data` page is built on — the workbook reader, the
 * operation engine, dataset replay and the validation rules — and asserts the
 * round trip the page promises: import, reshape, replay, roll back, export.
 * Nothing here touches a browser or a database.
 */
import assert from "node:assert/strict"

import { gridToCsv, readGridsFromFile } from "@/lib/export"
import { assessDropTable, assessOverwrite, assessRestoreSnapshot } from "@/lib/guardrails"
import { applyOperation, findingsByCell, gridBytes, suggestedRules, toEntry, validateGrid } from "@/lib/operations"
import type { DataOperation, Dataset, ValidationRule } from "@/lib/types"
import { datasetGrid } from "@/lib/workspace"

/* -------------------------------------------------------------------------- */
/* Import: one dataset per sheet                                              */
/* -------------------------------------------------------------------------- */

const csv = ["region,amount,qty", "EU,100,2", "US,250,1", "EU,,3", "APAC,90,5", "US,1000,2", "APAC,120,4"].join("\n")

const imported = await readGridsFromFile(new File([csv], "sales.csv", { type: "text/csv" }))
assert.deepEqual(imported.errors, [], "a CSV should import without errors")
assert.equal(imported.sheets.length, 1, "a CSV holds one sheet")
assert.deepEqual(
  imported.sheets[0].grid.columns.map((column) => column.name),
  ["region", "amount", "qty"],
)
assert.equal(imported.sheets[0].grid.rows.length, 6, "the header row is not data")
assert.match(imported.sheets[0].grid.columns[1].type, /INT|DECIMAL|NUMERIC/, "amount is detected as a number")

const base = imported.sheets[0].grid
const now = new Date().toISOString()
const dataset: Dataset = {
  id: "ds_check",
  name: "sales",
  sourceFile: "sales.csv",
  sheetName: imported.sheets[0].name,
  base,
  operations: [],
  createdAt: now,
  updatedAt: now,
}

/* -------------------------------------------------------------------------- */
/* Operations: apply, measure, record                                          */
/* -------------------------------------------------------------------------- */

const operations: DataOperation[] = [
  { kind: "filter", expression: "amount > 95" },
  { kind: "derive", column: "double_amount", type: "DECIMAL(10,2)", expression: "amount * 2" },
  { kind: "sort", column: "amount", direction: "desc" },
]

let live = datasetGrid(dataset)
for (const operation of operations) {
  const outcome = applyOperation(live, operation)
  dataset.operations.push(toEntry(operation, outcome.effect))
  live = outcome.grid
}

assert.deepEqual(
  dataset.operations.map((entry) => entry.summary),
  ["Kept rows where amount > 95", 'Added column "double_amount" = amount * 2', 'Sorted by "amount" descending'],
  "the history says what each operation did",
)

const [filtered, derived, sorted] = dataset.operations.map((entry) => entry.effect)
assert.equal(filtered.rowsIn, 6)
assert.equal(filtered.rowsOut, 4, "the blank amount is filtered out with the two below 95")
assert.equal(derived.columnsOut - derived.columnsIn, 1, "derive adds one column")
assert.equal(derived.cellsChanged, 4, "derive fills every surviving row")
assert.equal(sorted.rowsOut, 4, "sorting does not change the row count")

/* -------------------------------------------------------------------------- */
/* Replay: the stored dataset rebuilds the grid exactly                        */
/* -------------------------------------------------------------------------- */

const replayed = datasetGrid(dataset)
assert.deepEqual(replayed.rows, live.rows, "replaying the operations rebuilds the live grid")
assert.deepEqual(
  replayed.columns.map((column) => column.name),
  ["region", "amount", "qty", "double_amount"],
)
assert.deepEqual(
  replayed.rows.map((row) => row[1]),
  [1000, 250, 120, 100],
  "descending by amount",
)
assert.deepEqual(
  replayed.rows.map((row) => row[3]),
  [2000, 500, 240, 200],
  "the derived column is computed, not stored",
)

/* -------------------------------------------------------------------------- */
/* Rollback: truncate and replay                                               */
/* -------------------------------------------------------------------------- */

const rolledBack = datasetGrid({ ...dataset, operations: dataset.operations.slice(0, 2) })
assert.equal(rolledBack.rows.length, 4, "rolling back keeps the rows the filter kept")
assert.deepEqual(
  rolledBack.rows.map((row) => row[1]),
  [100, 250, 1000, 120],
  "dropping the sort restores the pre-sort order",
)
assert.equal(rolledBack.columns.length, 4, "the derived column survives a partial rollback")

const fromSource = datasetGrid({ ...dataset, operations: [] })
assert.equal(fromSource.rows.length, 6, "resetting to source returns every parsed row")
assert.equal(fromSource.columns.length, 3, "resetting to source drops every derived column")

/* -------------------------------------------------------------------------- */
/* Export                                                                      */
/* -------------------------------------------------------------------------- */

const exported = gridToCsv(rolledBack)
const lines = exported.split("\r\n")
assert.equal(lines[0], "region,amount,qty,double_amount", "the export header follows the grid")
assert.equal(lines.length - 1, 4, "one line per row")
assert.equal(gridBytes(base) > 0, true, "a grid reports a size for the retention dashboard")

/* -------------------------------------------------------------------------- */
/* Validation: findings, and the cells they flag                               */
/* -------------------------------------------------------------------------- */

const rules: ValidationRule[] = [
  { id: "r1", column: "amount", severity: "error", kind: "notNull" },
  { id: "r2", column: "region", severity: "warning", kind: "unique" },
  { id: "r3", column: "amount", severity: "error", kind: "range", min: 0, max: 500 },
  { id: "r4", column: "qty", severity: "error", kind: "type", type: "INT" },
]

const findings = validateGrid(base, rules)
assert.equal(
  findings.some((finding) => finding.ruleId === "r1" && finding.row === 2),
  true,
  "notNull flags the blank amount",
)
assert.equal(
  findings.some((finding) => finding.ruleId === "r3" && finding.value === 1000),
  true,
  "range flags the value above the maximum",
)
assert.equal(findings.filter((finding) => finding.ruleId === "r2").length, 3, "unique flags every repeat of a value")
assert.equal(
  findings.some((finding) => finding.ruleId === "r4"),
  false,
  "every qty parses as an integer",
)
const severityCounts = findings.reduce<Record<string, number>>(
  (totals, finding) => ({ ...totals, [finding.severity]: (totals[finding.severity] ?? 0) + 1 }),
  {},
)
assert.deepEqual(
  severityCounts,
  { error: 2, warning: 3 },
  "each finding carries its rule's severity: two errors, three unique warnings",
)

const flagged = findingsByCell(base, findings)
assert.equal(flagged.get("2:1"), "error", "the blank amount is flagged on its own cell")
assert.equal(flagged.get("0:2"), undefined, "a cell no rule looks at is not highlighted")
assert.deepEqual(
  suggestedRules(base).map((rule) => [rule.column, rule.kind]),
  [
    ["region", "notNull"],
    ["qty", "notNull"],
  ],
  "columns with no blanks suggest a notNull rule, and the one with a blank does not",
)

/* -------------------------------------------------------------------------- */
/* Guardrails: what the page gates on                                          */
/* -------------------------------------------------------------------------- */

const replace = assessOverwrite("sales", replayed.rows.length, "replace")
assert.equal(replace.risk, "destructive")
assert.equal(replace.confirmation, "sales", "replacing contents must be confirmed by typing the table name")

const create = assessOverwrite("sales", replayed.rows.length, "create")
assert.equal(create.risk, "safe", "creating a table touches nothing that exists")
assert.equal(create.confirmation, undefined)

const drop = assessDropTable("sales", base.rows.length)
assert.equal(drop.risk, "destructive")
assert.equal(drop.confirmation, "sales", "deleting a dataset must be confirmed by typing its name")

const restore = assessRestoreSnapshot(
  { name: "step 1", table: "sales", rowCount: rolledBack.rows.length, createdAt: now },
  replayed.rows.length,
)
assert.equal(restore.risk, "destructive")
assert.equal(restore.confirmation, "sales", "rolling several operations back must be confirmed by name")

console.log("check-data: all assertions passed")
