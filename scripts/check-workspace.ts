/**
 * Workspace self-check. Runs the real expression engine, the operation
 * pipeline, and the guardrail classifier against grids built in memory.
 *
 *   bun scripts/check-workspace.ts
 *
 * Fails loudly if a change breaks an invariant the dataset explorer and the
 * table studio depend on — in particular that replaying an operation list from
 * the base grid is the same as applying the operations one at a time, which is
 * what makes rollback exact.
 */
import assert from "node:assert/strict"

import { compileExpression, evaluateExpression, ExpressionError, validateExpression } from "@/lib/expression"
import { analyseSql, assessDropTable, assessSql, assessTruncate } from "@/lib/guardrails"
import {
  applyOperation,
  applyOperations,
  describeOperation,
  findingsByCell,
  gridBytes,
  gridToRows,
  gridToTableConfig,
  suggestedRules,
  validateGrid,
} from "@/lib/operations"
import { gridToCsv, gridToJson, safeFileName } from "@/lib/export"
import type { DataOperation, Grid, ValidationRule } from "@/lib/types"

const base: Grid = {
  columns: [
    { name: "id", type: "INT", nullable: false, isPrimaryKey: true },
    { name: "name", type: "VARCHAR(100)", nullable: false },
    { name: "region", type: "VARCHAR(20)", nullable: true },
    { name: "amount", type: "DECIMAL(10,2)", nullable: true },
    { name: "joined", type: "DATE", nullable: true },
  ],
  rows: [
    [1, "  Ada  ", "EU", 12.5, "2024-01-15"],
    [2, "Grace", "US", 7.25, "2024-06-01"],
    [3, "Alan", "EU", null, "2024-03-09"],
    [4, "Grace", "APAC", 30, "2023-11-02"],
    [5, "Edsger", null, 4.75, "2024-01-15"],
  ],
}

const columnNames = base.columns.map((column) => column.name)

/* ---------------------------------------------------------------- expressions */

assert.equal(evaluateExpression("amount * 2", columnNames, base.rows[0]), 25)
assert.equal(evaluateExpression("id + 1 > 1 AND region = 'EU'", columnNames, base.rows[0]), true)
assert.equal(evaluateExpression("id + 1 > 1 AND region = 'EU'", columnNames, base.rows[1]), false)
// AND binds tighter than OR, so this is `false OR (true AND false)`.
assert.equal(evaluateExpression("id = 99 OR id = 1 AND region = 'US'", columnNames, base.rows[0]), false)
assert.equal(evaluateExpression("NOT region = 'US'", columnNames, base.rows[0]), true)
assert.equal(evaluateExpression("region IS NULL", columnNames, base.rows[4]), true)
assert.equal(evaluateExpression("region IS NOT NULL", columnNames, base.rows[0]), true)
assert.equal(evaluateExpression("region IN ('EU', 'US')", columnNames, base.rows[3]), false)
assert.equal(evaluateExpression("region NOT IN ('EU', 'US')", columnNames, base.rows[3]), true)
assert.equal(evaluateExpression("name LIKE 'A%'", columnNames, base.rows[0]), false, "LIKE matches the raw cell; it does not trim")
assert.equal(evaluateExpression("TRIM(name) LIKE 'A%'", columnNames, base.rows[0]), true)
assert.equal(evaluateExpression("name LIKE '%Ada%'", columnNames, base.rows[0]), true)
assert.equal(evaluateExpression("TRIM(name) ILIKE 'a%'", columnNames, base.rows[0]), true)
assert.equal(evaluateExpression("LEN(TRIM(name))", columnNames, base.rows[0]), 3)
assert.equal(evaluateExpression("UPPER(region)", columnNames, base.rows[1]), "US")
assert.equal(evaluateExpression("COALESCE(amount, 0)", columnNames, base.rows[2]), 0)
assert.equal(evaluateExpression("IF(amount IS NULL, 'none', 'some')", columnNames, base.rows[2]), "none")
assert.equal(evaluateExpression("CASE WHEN amount > 10 THEN 'big' WHEN amount > 5 THEN 'mid' ELSE 'small' END", columnNames, base.rows[4]), "small")
assert.equal(evaluateExpression("YEAR(joined)", columnNames, base.rows[0]), 2024)
assert.equal(evaluateExpression("MONTH(joined)", columnNames, base.rows[3]), 11)
assert.equal(evaluateExpression("DATEDIFF(joined, joined)", columnNames, base.rows[0]), 0)
assert.equal(evaluateExpression("REGEX_EXTRACT('a-12', '-(\\d+)')", columnNames, base.rows[0]), "12")
assert.equal(evaluateExpression("REGEX_MATCH('abc', '^a.c$')", columnNames, base.rows[0]), true)
assert.equal(evaluateExpression("CONCAT(region, '-', id)", columnNames, base.rows[0]), "EU-1")
assert.equal(evaluateExpression("ROUND(amount / 3, 2)", columnNames, base.rows[0]), 4.17)
assert.equal(evaluateExpression("SPLIT('a|b|c', '|', 1)", columnNames, base.rows[0]), "b")

// Null arithmetic yields null rather than NaN, and null comparisons are false.
assert.equal(evaluateExpression("amount + 1", columnNames, base.rows[2]), null)
assert.equal(evaluateExpression("amount > 0", columnNames, base.rows[2]), false)
assert.equal(evaluateExpression("amount / 0", columnNames, base.rows[0]), null)

// Bracketed names reach headers that are not valid identifiers.
const spaced: Grid = { columns: [{ name: "Order Total", type: "INT", nullable: true }], rows: [[10]] }
assert.equal(evaluateExpression("[Order Total] * 2", ["Order Total"], spaced.rows[0]), 20)

// Column lookup is case-insensitive.
assert.equal(evaluateExpression("AMOUNT", columnNames, base.rows[0]), 12.5)

// Unknown columns and functions are reported, not silently false.
assert.deepEqual(validateExpression("nope > 1", columnNames), { ok: false, error: 'Unknown column "nope"' })
assert.ok(validateExpression("NOPE(1)", columnNames).ok === false, "unknown function is rejected")
assert.throws(() => compileExpression("id +", columnNames), ExpressionError)
assert.throws(() => compileExpression("", columnNames), ExpressionError)
assert.throws(() => compileExpression("id + ", columnNames), ExpressionError)

// Only the columns actually read are reported, which the derive editor shows.
assert.deepEqual(compileExpression("amount * 2 + id", columnNames).columns, ["id", "amount"])

/* ----------------------------------------------------------------- operations */

const run = (operation: DataOperation) => applyOperation(base, operation)

assert.equal(run({ kind: "filter", expression: "region = 'EU'" }).grid.rows.length, 2)
assert.deepEqual(run({ kind: "filter", expression: "region = 'EU'" }).effect, { rowsIn: 5, rowsOut: 2, cellsChanged: 0, columnsIn: 5, columnsOut: 5 })

const derived = run({ kind: "derive", column: "net", type: "DECIMAL(10,2)", expression: "amount * 0.8" })
assert.deepEqual(derived.grid.columns.map((column) => column.name), [...columnNames, "net"])
assert.equal(derived.grid.rows[0][5], 10)
assert.equal(derived.effect.columnsOut, 6)

// A derived column never collides with an existing name.
assert.equal(run({ kind: "derive", column: "name", type: "VARCHAR(10)", expression: "id" }).grid.columns.at(-1)?.name, "name_2")

const renamed = run({ kind: "rename", from: "region", to: "territory" })
assert.equal(renamed.grid.columns[2].name, "territory")
assert.equal(renamed.grid.rows[0][2], "EU", "renaming does not move values")
assert.throws(() => run({ kind: "rename", from: "region", to: "name" }), /already exists/)
assert.throws(() => run({ kind: "rename", from: "missing", to: "x" }), /no longer exists/)

const dropped = run({ kind: "drop", columns: ["region", "joined"] })
assert.deepEqual(dropped.grid.columns.map((column) => column.name), ["id", "name", "amount"])
assert.equal(dropped.grid.rows[0].length, 3)
assert.equal(dropped.effect.columnsOut, 3)
assert.throws(() => run({ kind: "drop", columns: ["id", "name", "region", "amount", "joined"] }), /at least one column/)

const kept = run({ kind: "keep", columns: ["name", "id"] })
assert.deepEqual(kept.grid.columns.map((column) => column.name), ["name", "id"])
assert.deepEqual(kept.grid.rows[0], ["  Ada  ", 1], "keep reorders positionally with the values")

const reordered = run({ kind: "reorder", columns: ["amount", "id"] })
assert.deepEqual(reordered.grid.columns.map((column) => column.name), ["amount", "id", "name", "region", "joined"])
assert.equal(reordered.grid.rows[0][0], 12.5)

const cast = run({ kind: "cast", column: "amount", type: "INT" })
assert.equal(cast.grid.rows[0][3], 12, "cast to INT truncates toward zero, like SQL CAST")
assert.equal(cast.grid.rows[2][3], null, "a blank stays blank through a cast")
assert.equal(cast.grid.columns[3].type, "INT")

const filled = run({ kind: "fill", column: "amount", strategy: "mean" })
assert.equal(filled.grid.rows[2][3], 13.625)
const filledForward = run({ kind: "fill", column: "region", strategy: "forward" })
assert.equal(filledForward.grid.rows[4][2], "APAC", "forward fill carries the last value down")
const filledBackward = run({ kind: "fill", column: "region", strategy: "backward" })
assert.equal(filledBackward.grid.rows[4][2], null, "backward fill leaves a trailing blank alone")
const filledLiteral = run({ kind: "fill", column: "region", strategy: "value", value: "UNKNOWN" })
assert.equal(filledLiteral.grid.rows[4][2], "UNKNOWN")
const filledMode = run({ kind: "fill", column: "region", strategy: "mode" })
assert.equal(filledMode.grid.rows[4][2], "EU", "mode picks the most common non-blank value")

const deduped = run({ kind: "dedupe", columns: ["name"] })
assert.equal(deduped.grid.rows.length, 4, "the second Grace is dropped")
assert.deepEqual(deduped.effect, { rowsIn: 5, rowsOut: 4, cellsChanged: 0, columnsIn: 5, columnsOut: 5 })

const sorted = run({ kind: "sort", column: "amount", direction: "asc" })
assert.deepEqual(sorted.grid.rows.map((row) => row[0]), [5, 2, 1, 4, 3], "ascending, with the blank last")
const sortedDesc = run({ kind: "sort", column: "amount", direction: "desc" })
assert.deepEqual(sortedDesc.grid.rows.map((row) => row[0]), [4, 1, 2, 5, 3], "descending, with the blank still last")
const sortedText = run({ kind: "sort", column: "name", direction: "asc" })
assert.deepEqual(sortedText.grid.rows.map((row) => row[1]), ["  Ada  ", "Alan", "Edsger", "Grace", "Grace"])

const trimmed = run({ kind: "trim", columns: ["name"] })
assert.equal(trimmed.grid.rows[0][1], "Ada")
assert.equal(trimmed.effect.cellsChanged, 1, "only the padded cell counts as changed")

const replaced = run({ kind: "replace", column: "region", find: "EU", replacement: "Europe", regex: false })
assert.equal(replaced.grid.rows[0][2], "Europe")
const regexReplaced = run({ kind: "replace", column: "name", find: "^\\s+|\\s+$", replacement: "", regex: true })
assert.equal(regexReplaced.grid.rows[0][1], "Ada")

assert.equal(run({ kind: "limit", count: 2 }).grid.rows.length, 2)
assert.equal(run({ kind: "limit", count: 99 }).grid.rows.length, 5)

// The base grid is never mutated by any operation.
assert.deepEqual(base.rows[0], [1, "  Ada  ", "EU", 12.5, "2024-01-15"], "applyOperation is pure")

// Replaying from the base is identical to applying operations one at a time —
// this is what makes rolling back to an earlier entry exact.
const pipeline: DataOperation[] = [
  { kind: "trim", columns: ["name"] },
  { kind: "filter", expression: "amount IS NOT NULL" },
  { kind: "derive", column: "band", type: "VARCHAR(10)", expression: "IF(amount >= 10, 'high', 'low')" },
  { kind: "sort", column: "amount", direction: "desc" },
]
const replayed = applyOperations(base, pipeline)
let incremental = base
for (const operation of pipeline) incremental = applyOperation(incremental, operation).grid
assert.deepEqual(replayed.grid, incremental, "replay and incremental application agree")
assert.equal(replayed.effects.length, pipeline.length)

// Truncating the list is a rollback: three operations replayed is the state
// after three operations, not after four.
const rolledBack = applyOperations(base, pipeline.slice(0, 3))
let stepwise = base
for (const operation of pipeline.slice(0, 3)) stepwise = applyOperation(stepwise, operation).grid
assert.deepEqual(rolledBack.grid, stepwise, "rollback to an earlier entry is exact")
assert.notDeepEqual(rolledBack.grid, replayed.grid, "rolling back actually changes the result")

// Every operation has a sentence for the history list.
for (const operation of pipeline) {
  const summary = describeOperation(operation)
  assert.ok(summary.length > 0 && summary !== "undefined", `${operation.kind} has a description`)
}

/* ----------------------------------------------------------------- validation */

const rules: ValidationRule[] = [
  { id: "r1", column: "id", severity: "error", kind: "unique" },
  { id: "r2", column: "name", severity: "error", kind: "notNull" },
  { id: "r3", column: "amount", severity: "warning", kind: "range", min: 5, max: 20 },
  { id: "r4", column: "joined", severity: "error", kind: "type", type: "DATE" },
  { id: "r5", column: "region", severity: "warning", kind: "pattern", pattern: "^(EU|US|APAC)$" },
]

const findings = validateGrid(base, rules)
// amount: 30 is above the range and 4.75 is below it.
assert.deepEqual(
  findings.map((finding) => `${finding.ruleId}@${finding.row}`).sort(),
  ["r3@3", "r3@4"],
)

// Blank cells are not range, pattern or type failures — that is what a notNull
// rule is for, so a nullable column does not report the same gap three times.
assert.deepEqual(validateGrid(base, [{ id: "n", column: "amount", severity: "error", kind: "notNull" }]).map((finding) => finding.row), [2])
assert.deepEqual(validateGrid(base, [{ id: "p", column: "region", severity: "error", kind: "pattern", pattern: "^(EU|US|APAC)$" }]), [])
assert.deepEqual(validateGrid(base, [{ id: "t", column: "joined", severity: "error", kind: "type", type: "DATE" }]), [])
// A value that is present but wrong is still reported.
assert.deepEqual(
  validateGrid({ columns: base.columns, rows: [["1", "x", "EU", 1, "not a date"]] }, [
    { id: "t3", column: "joined", severity: "error", kind: "type", type: "DATE" },
  ]).map((finding) => finding.row),
  [0],
)

// A unique rule reports the duplicate, not the first occurrence.
const duplicateRule: ValidationRule[] = [{ id: "u", column: "name", severity: "error", kind: "unique" }]
assert.deepEqual(validateGrid(base, duplicateRule).map((finding) => finding.row), [3])

// A broken expression rule is skipped rather than throwing mid-scan.
const broken: ValidationRule[] = [{ id: "b", column: "id", severity: "error", kind: "expression", expression: "id >>>" }]
assert.deepEqual(validateGrid(base, broken), [])

// Rules pointing at a column that no longer exists are ignored.
const stale: ValidationRule[] = [{ id: "s", column: "gone", severity: "error", kind: "notNull" }]
assert.deepEqual(validateGrid(base, stale), [])

// Suggested rules come from the grid's own metadata: id is the primary key.
assert.deepEqual(
  suggestedRules(base).map((rule) => `${rule.column}:${rule.kind}`),
  ["id:notNull", "id:unique", "name:notNull"],
)

const flagged = findingsByCell(base, findings)
assert.equal(flagged.get("3:3"), "warning")
assert.equal(flagged.size, 2)

/* ----------------------------------------------------------------- guardrails */

// Comment stripping happens before the statement check, so a comment cannot
// smuggle a second statement past the read-only test.
assert.equal(analyseSql("SELECT 1").readOnly, true)
assert.equal(analyseSql("select * from t where a = ';'").readOnly, true, "a semicolon inside a literal is not a separator")
assert.equal(analyseSql("SELECT 1; DROP TABLE t").blockedReason?.includes("one statement"), true)
assert.equal(analyseSql("SELECT 1 -- ; DROP TABLE t").readOnly, true, "line comments are stripped")
assert.equal(analyseSql("SELECT 1 /* ; DROP TABLE t */").readOnly, true, "block comments are stripped")
assert.equal(analyseSql("-- lead\nDELETE FROM t").readOnly, false)
assert.equal(analyseSql("WITH x AS (SELECT 1) SELECT * FROM x").readOnly, true)
assert.equal(analyseSql("PRAGMA table_info('t')").readOnly, true)
assert.equal(analyseSql("PRAGMA journal_mode = WAL").blockedReason !== undefined, true, "a writing pragma is refused")
assert.equal(analyseSql("   ").blockedReason !== undefined, true)

// A write is refused while write access is off, and cautioned when it is on.
assert.equal(assessSql("DELETE FROM t WHERE id = 1", { allowWrite: false }).risk, "destructive")
assert.equal(assessSql("DELETE FROM t WHERE id = 1", { allowWrite: true }).risk, "caution")
assert.equal(assessSql("UPDATE t SET a = 1 WHERE id = 1", { allowWrite: true }).risk, "caution")
// Without a WHERE clause the same statements affect every row, so they escalate.
assert.equal(assessSql("DELETE FROM t", { allowWrite: true }).risk, "destructive")
assert.equal(assessSql("DELETE FROM t", { allowWrite: true }).confirmation, "EXECUTE")
assert.equal(assessSql("UPDATE t SET a = 1", { allowWrite: true }).confirmation, "EXECUTE")
assert.equal(assessSql("SELECT 1", { allowWrite: true }).risk, "safe")

// Destructive table operations always demand the object's name typed back.
const drop = assessDropTable("orders", 1200)
assert.equal(drop.risk, "destructive")
assert.equal(drop.confirmation, "orders")
assert.ok(drop.summary.includes("1,200 rows"), "the row count is stated, not implied")
assert.equal(assessTruncate("orders", 0).confirmation, "orders")
assert.equal(assessTruncate("orders", undefined).summary.includes("unknown number of rows"), true)

/* --------------------------------------------------------------- writing out */

const tableConfig = gridToTableConfig(base, "orders", "id")
assert.equal(tableConfig.tableName, "orders")
assert.equal(tableConfig.primaryKey, "id")
assert.equal(tableConfig.columns.length, 5)
assert.deepEqual(tableConfig.columns.map((column) => column.name), columnNames)

const amountColumn = tableConfig.columns[3]
assert.equal(amountColumn.suggestedType, "DECIMAL(10,2)")
assert.equal(amountColumn.nullable, true)
assert.equal(amountColumn.totalCount, 5)
assert.equal(amountColumn.nullCount, 1, "the blank amount is counted")
assert.equal(amountColumn.uniqueValues, 5)
assert.equal(amountColumn.samples.length, 4, "samples exclude the blank")
assert.equal(amountColumn.samples.includes(null), false)
assert.equal(tableConfig.columns[1].uniqueValues, 4, "the repeated name counts once")
assert.equal(tableConfig.columns[1].nullCount, 0)

// Cells are coerced to the column's declared type on the way out, so what is
// sent to the driver matches what the grid promised.
const written = gridToRows(base)
assert.equal(written[0][0], 1)
assert.equal(written[0][3], 12.5)
assert.equal(written[2][3], null, "a blank is sent as NULL, not an empty string")
assert.deepEqual(
  gridToRows({
    columns: [
      { name: "n", type: "INT", nullable: false },
      { name: "b", type: "BOOLEAN", nullable: true },
      { name: "d", type: "DATE", nullable: true },
      { name: "t", type: "VARCHAR(10)", nullable: true },
    ],
    rows: [["42.9", "yes", "2024-02-29", 7]],
  }),
  [[42, true, "2024-02-29", "7"]],
)

// Size estimation is used by the retention dashboard; it must be monotonic.
assert.ok(gridBytes(base) > 0)
assert.ok(gridBytes({ columns: base.columns, rows: [...base.rows, ...base.rows] }) > gridBytes(base))

/* -------------------------------------------------------------------- export */

const csv = gridToCsv(base)
assert.equal(csv.split("\r\n").length, 6, "a header row plus every data row")
assert.equal(csv.split("\r\n")[0], "id,name,region,amount,joined")
assert.ok(csv.includes('"  Ada  "'), "a value with surrounding spaces is quoted")
const quoted = gridToCsv({ columns: [{ name: "a", type: "TEXT", nullable: true }], rows: [['say "hi"'], ["a,b"], ["line\nbreak"]] })
assert.ok(quoted.includes('"say ""hi"""'), "embedded quotes are doubled")
assert.ok(quoted.includes('"a,b"'), "a value holding the delimiter is quoted")
assert.ok(quoted.includes('"line\nbreak"'), "a value holding a newline is quoted")

const json = JSON.parse(gridToJson(base)) as Array<Record<string, unknown>>
assert.equal(json.length, 5)
assert.deepEqual(json[0], { id: 1, name: "  Ada  ", region: "EU", amount: 12.5, joined: "2024-01-15" })
assert.equal(json[2].amount, null, "a blank is null in JSON, not an empty string")

assert.equal(safeFileName("My Data / 2024", "csv"), "My_Data_2024.csv")
assert.equal(safeFileName("///", "json"), "export.json")

console.log("check-workspace: all assertions passed")
