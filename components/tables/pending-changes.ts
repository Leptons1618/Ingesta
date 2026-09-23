/**
 * The pending-change model behind the table studio.
 *
 * Nothing in this file talks to the database. A pending change is a plain
 * description of one edit, which is what lets the page show the whole plan,
 * price it with the guardrails, and apply it in a fixed order — and lets a
 * failure keep the part that never ran instead of dropping it on the floor.
 */

import { api, type ApiResult } from "@/lib/api"
import {
  assessChangeType,
  assessDropColumn,
  assessOverwrite,
  assessRenameTable,
  assessRowDelete,
  assessRowUpdate,
} from "@/lib/guardrails"
import type { AlterAction, DatabaseConfig, GridColumn, GuardrailAssessment, RiskLevel, RowMutation } from "@/lib/types"
import { newId } from "@/lib/utils"

/** One edited cell, held until the user applies it. */
export interface CellEdit {
  /** The primary-key value of the row this cell belongs to. */
  rowKey: unknown
  column: string
  value: unknown
  /** What the database holds now, so retyping the same value records nothing. */
  previous: unknown
}

/** A row that only exists in the browser until it is inserted. */
export interface NewRow {
  id: string
  values: Record<string, unknown>
}

export interface RowRemoval {
  rowKey: unknown
  /** Human label for the removed-row chip; the key alone is rarely enough. */
  label: string
}

export interface PendingChanges {
  edits: CellEdit[]
  inserts: NewRow[]
  removals: RowRemoval[]
  adds: Array<{ column: GridColumn }>
  renames: Array<{ from: string; to: string }>
  types: Array<{ column: string; from: string; fromNullable: boolean; type: string; nullable: boolean }>
  drops: Array<{ column: string }>
  /** Column order for the next "save as"; engines have no in-place reorder. */
  order: string[] | null
  renameTable: string | null
}

export function emptyPending(): PendingChanges {
  return {
    edits: [],
    inserts: [],
    removals: [],
    adds: [],
    renames: [],
    types: [],
    drops: [],
    order: null,
    renameTable: null,
  }
}

/* --------------------------------------------------------------- recording */

/**
 * A cell editor always hands back text, so the target column's declared type is
 * what turns it back into a value the database will accept.
 */
export function coerceCell(value: string, type: string): unknown {
  if (value === "") return null

  const upper = type.toUpperCase()
  if (/(INT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL)/.test(upper)) {
    const number = Number(value)
    return Number.isFinite(number) ? number : value
  }
  if (upper.includes("BOOL") || upper === "BIT") {
    if (/^(true|yes|y|1)$/i.test(value)) return true
    if (/^(false|no|n|0)$/i.test(value)) return false
  }

  return value
}

export function recordEdit(pending: PendingChanges, edit: CellEdit): PendingChanges {
  const bothEmpty = edit.value === null && edit.previous === null
  const oneEmpty = edit.value === null || edit.previous === null
  const unchanged = bothEmpty || (!oneEmpty && String(edit.value) === String(edit.previous))

  const rest = pending.edits.filter((entry) => !(entry.rowKey === edit.rowKey && entry.column === edit.column))
  return { ...pending, edits: unchanged ? rest : [...rest, edit] }
}

export function addRow(pending: PendingChanges): PendingChanges {
  return { ...pending, inserts: [...pending.inserts, { id: newId("row"), values: {} }] }
}

export function setNewRowValue(pending: PendingChanges, id: string, column: string, value: unknown): PendingChanges {
  return {
    ...pending,
    inserts: pending.inserts.map((row) => (row.id === id ? { ...row, values: { ...row.values, [column]: value } } : row)),
  }
}

export function removeNewRow(pending: PendingChanges, id: string): PendingChanges {
  return { ...pending, inserts: pending.inserts.filter((row) => row.id !== id) }
}

/** Removing a row also drops its edits: they can never be applied on their own. */
export function removeRow(pending: PendingChanges, removal: RowRemoval): PendingChanges {
  return {
    ...pending,
    removals: pending.removals.some((entry) => entry.rowKey === removal.rowKey)
      ? pending.removals
      : [...pending.removals, removal],
    edits: pending.edits.filter((edit) => edit.rowKey !== removal.rowKey),
  }
}

export function setColumnAdd(pending: PendingChanges, column: GridColumn): PendingChanges {
  return { ...pending, adds: [...pending.adds.filter((add) => add.column.name !== column.name), { column }] }
}

export function setColumnRename(pending: PendingChanges, from: string, to: string): PendingChanges {
  const renames = pending.renames.filter((rename) => rename.from !== from)
  return { ...pending, renames: to.trim() ? [...renames, { from, to: to.trim() }] : renames }
}

export function setColumnType(
  pending: PendingChanges,
  change: { column: string; from: string; fromNullable: boolean; type: string; nullable: boolean },
): PendingChanges {
  const types = pending.types.filter((entry) => entry.column !== change.column)
  // A column that still matches what the database declares is not a change.
  const same = change.from === change.type && change.fromNullable === change.nullable
  return { ...pending, types: same ? types : [...types, change] }
}

/** Dropping a column cancels the renames and type changes that would precede it. */
export function setColumnDrop(pending: PendingChanges, column: string): PendingChanges {
  return {
    ...pending,
    drops: [...pending.drops.filter((drop) => drop.column !== column), { column }],
    renames: pending.renames.filter((rename) => rename.from !== column),
    types: pending.types.filter((entry) => entry.column !== column),
  }
}

export function setColumnOrder(pending: PendingChanges, order: string[] | null): PendingChanges {
  return { ...pending, order }
}

export function setTableRename(pending: PendingChanges, to: string): PendingChanges {
  return { ...pending, renameTable: to.trim() || null }
}

/* --------------------------------------------------------------- reviewing */

export interface PendingEntry {
  id: string
  family: string
  title: string
  detail: string
}

/** Every pending change as one list row; ids are what `keepOnly` keeps. */
export function pendingEntries(pending: PendingChanges, table: string, primaryKey: string | null): PendingEntry[] {
  const entries: PendingEntry[] = []

  for (const add of pending.adds) {
    entries.push({
      id: `add:${add.column.name}`,
      family: "Schema",
      title: `Add column "${add.column.name}"`,
      detail: `${add.column.type}${add.column.nullable ? ", nullable" : ", not null"}`,
    })
  }

  for (const rename of pending.renames) {
    entries.push({
      id: `rename:${rename.from}`,
      family: "Schema",
      title: `Rename "${rename.from}" to "${rename.to}"`,
      detail: "Every value moves with the column",
    })
  }

  for (const change of pending.types) {
    entries.push({
      id: `type:${change.column}`,
      family: "Schema",
      title: `Change "${change.column}" to ${change.type}`,
      detail: `Was ${change.from}${change.fromNullable ? ", nullable" : ", not null"} → ${change.type}${
        change.nullable ? ", nullable" : ", not null"
      }`,
    })
  }

  for (const drop of pending.drops) {
    const renamed = pending.renames.find((rename) => rename.from === drop.column)
    entries.push({
      id: `drop:${drop.column}`,
      family: "Schema",
      title: `Drop column "${renamed?.to ?? drop.column}"`,
      detail: "The values in it are not recoverable",
    })
  }

  if (pending.order) {
    entries.push({
      id: "order",
      family: "Layout",
      title: "Reorder columns",
      detail: "Applies when saving as a new table; engines keep their own column order",
    })
  }

  if (pending.renameTable) {
    entries.push({
      id: "rename-table",
      family: "Table",
      title: `Rename table to "${pending.renameTable}"`,
      detail: `Was "${table}"`,
    })
  }

  for (const insert of pending.inserts) {
    const filled = Object.keys(insert.values).filter((column) => insert.values[column] !== null && insert.values[column] !== "")
    entries.push({
      id: `insert:${insert.id}`,
      family: "Rows",
      title: "New row",
      detail: filled.length > 0 ? filled.join(", ") : "No values yet",
    })
  }

  for (const group of editsByKey(pending.edits)) {
    entries.push({
      id: `update:${group.key}`,
      family: "Rows",
      title: `Update ${primaryKey ?? "row"} ${group.key}`,
      detail: group.edits.map((edit) => `${edit.column} → ${edit.value === null ? "NULL" : String(edit.value)}`).join(", "),
    })
  }

  for (const removal of pending.removals) {
    entries.push({
      id: `delete:${String(removal.rowKey)}`,
      family: "Rows",
      title: `Delete ${primaryKey ?? "row"} ${String(removal.rowKey)}`,
      detail: removal.label,
    })
  }

  return entries
}

export function pendingCount(pending: PendingChanges): number {
  return (
    pending.edits.length +
    pending.inserts.length +
    pending.removals.length +
    pending.adds.length +
    pending.renames.length +
    pending.types.length +
    pending.drops.length +
    (pending.order ? 1 : 0) +
    (pending.renameTable ? 1 : 0)
  )
}

/**
 * Keeps only the named plan steps: what a stopped apply leaves pending. Row
 * families are one step each, so an insert or delete step keeps every row it
 * still holds.
 */
export function keepOnly(pending: PendingChanges, keep: Set<string>): PendingChanges {
  return {
    edits: pending.edits.filter((edit) => keep.has(`update:${String(edit.rowKey)}`)),
    inserts: keep.has("insert") ? pending.inserts : [],
    removals: keep.has("delete") ? pending.removals : [],
    adds: pending.adds.filter((add) => keep.has(`add:${add.column.name}`)),
    renames: pending.renames.filter((rename) => keep.has(`rename:${rename.from}`)),
    types: pending.types.filter((change) => keep.has(`type:${change.column}`)),
    drops: pending.drops.filter((drop) => keep.has(`drop:${drop.column}`)),
    order: keep.has("order") ? pending.order : null,
    renameTable: keep.has("rename-table") ? pending.renameTable : null,
  }
}

/**
 * Drops one entry from the review list. Insert and delete entries are listed
 * per row, so they are removed per row; everything else is one plan step.
 */
export function removePendingEntry(pending: PendingChanges, id: string, primaryKey: string | null): PendingChanges {
  if (id.startsWith("insert:")) return removeNewRow(pending, id.slice("insert:".length))
  if (id.startsWith("delete:")) {
    const key = id.slice("delete:".length)
    return { ...pending, removals: pending.removals.filter((removal) => String(removal.rowKey) !== key) }
  }

  const keep = pendingPlan(pending, primaryKey)
    .map((item) => item.id)
    .filter((stepId) => stepId !== id)
  return keepOnly(pending, new Set(keep))
}

/* ------------------------------------------------------------- guardrails */

const RISK_RANK: Record<RiskLevel, number> = { safe: 0, caution: 1, destructive: 2 }

/**
 * No guardrail covers a new column, so its verdict is written here rather than
 * letting the plan look safer than it is.
 */
function assessAddColumns(table: string, columns: string[]): GuardrailAssessment {
  const named = columns.length === 1 ? `column "${columns[0]}"` : `${columns.length} columns`
  return {
    risk: "caution",
    title: `Add ${named} to "${table}"`,
    summary: "A new column is appended, and every row that already exists holds NULL in it.",
    warnings: ["A column added as NOT NULL without a default is rejected while the table still has rows."],
  }
}

/** One assessment per change family, in the order the plan will run. */
export function assessPending(
  pending: PendingChanges,
  table: string,
  rowCount: number,
): GuardrailAssessment[] {
  const assessments: GuardrailAssessment[] = []

  if (pending.adds.length > 0) {
    assessments.push(assessAddColumns(table, pending.adds.map((add) => add.column.name)))
  }

  for (const change of pending.types) {
    assessments.push(assessChangeType(table, change.column, change.from, change.type))
  }

  for (const drop of pending.drops) {
    const renamed = pending.renames.find((rename) => rename.from === drop.column)
    assessments.push(assessDropColumn(table, renamed?.to ?? drop.column, rowCount))
  }

  if (pending.renameTable) assessments.push(assessRenameTable(table, pending.renameTable))

  if (pending.inserts.length > 0) {
    assessments.push(assessOverwrite(table, pending.inserts.length, "append"))
  }

  const updatedRows = editsByKey(pending.edits).length
  if (updatedRows > 0) assessments.push(assessRowUpdate(table, updatedRows))

  if (pending.removals.length > 0) assessments.push(assessRowDelete(table, pending.removals.length))

  return assessments
}

/**
 * Folds the families into the single verdict the confirm dialog shows: the
 * worst risk wins, and every warning keeps the title of the change that raised
 * it so the body reads as a list of consequences, not a wall of sentences.
 */
export function mergeAssessments(
  assessments: GuardrailAssessment[],
  table: string,
  count: number,
): GuardrailAssessment {
  const worst = assessments.reduce<GuardrailAssessment | null>(
    (current, candidate) =>
      current === null || RISK_RANK[candidate.risk] > RISK_RANK[current.risk] ? candidate : current,
    null,
  )

  const warnings = [
    ...new Set(assessments.flatMap((assessment) => assessment.warnings.map((warning) => `${assessment.title}: ${warning}`))),
  ]

  return {
    risk: worst?.risk ?? "safe",
    title: `Apply ${count} change${count === 1 ? "" : "s"} to "${table}"`,
    summary: worst?.summary ?? "The pending changes are applied to the database.",
    warnings,
    confirmation: assessments.find((assessment) => assessment.confirmation)?.confirmation,
  }
}

/* ------------------------------------------------------------------ plan */

/** One change as data: the ids, labels and payloads the runner and the review list share. */
export type PlanItem =
  | { id: string; label: string; action: AlterAction }
  | { id: string; label: string; mutation: RowMutation }

export interface PendingStep {
  /** Stable key, also what the unapplied tail keeps after a failure. */
  id: string
  /** What ran, for the failure report. */
  label: string
  /** `table` is the name the database holds at this point in the plan. */
  run: (table: string) => Promise<ApiResult<unknown>>
}

function editsByKey(edits: CellEdit[]): Array<{ key: string; rowKey: unknown; edits: CellEdit[] }> {
  const groups = new Map<string, { key: string; rowKey: unknown; edits: CellEdit[] }>()

  for (const edit of edits) {
    const key = String(edit.rowKey)
    const group = groups.get(key) ?? { key, rowKey: edit.rowKey, edits: [] }
    group.edits.push(edit)
    groups.set(key, group)
  }

  return [...groups.values()]
}

/**
 * The plan, in the one order that works: schema first so the rows that follow
 * fit the new shape, inserts before updates and deletes, and the table rename
 * last so every earlier statement still addresses a name the database knows.
 */
export function pendingPlan(pending: PendingChanges, primaryKey: string | null): PlanItem[] {
  const plan: PlanItem[] = []

  for (const add of pending.adds) {
    plan.push({
      id: `add:${add.column.name}`,
      label: `Add column "${add.column.name}"`,
      action: { action: "add-column", column: add.column },
    })
  }

  for (const rename of pending.renames) {
    plan.push({
      id: `rename:${rename.from}`,
      label: `Rename column "${rename.from}" to "${rename.to}"`,
      action: { action: "rename-column", from: rename.from, to: rename.to },
    })
  }

  for (const change of pending.types) {
    plan.push({
      id: `type:${change.column}`,
      label: `Change "${change.column}" to ${change.type}`,
      action: { action: "change-type", column: change.column, type: change.type, nullable: change.nullable },
    })
  }

  for (const drop of pending.drops) {
    const renamed = pending.renames.find((rename) => rename.from === drop.column)
    const column = renamed?.to ?? drop.column
    plan.push({
      id: `drop:${drop.column}`,
      label: `Drop column "${column}"`,
      action: { action: "drop-column", column },
    })
  }

  if (pending.renameTable) {
    plan.push({
      id: "rename-table",
      label: `Rename table to "${pending.renameTable}"`,
      action: { action: "rename-table", to: pending.renameTable },
    })
  }

  if (pending.inserts.length > 0) {
    // Untouched cells are left out so each column's declared default can apply.
    const records = pending.inserts.map((row) =>
      Object.fromEntries(Object.entries(row.values).filter(([, value]) => value !== undefined && value !== "")),
    )
    plan.push({
      id: "insert",
      label: `Insert ${records.length} row${records.length === 1 ? "" : "s"}`,
      mutation: { action: "insert", records },
    })
  }

  // One call per row: `mutateRows` wants one record per key, and a row that
  // fails then leaves every other row's edit reportable on its own.
  if (primaryKey) {
    for (const group of editsByKey(pending.edits)) {
      const record = Object.fromEntries(group.edits.map((edit) => [edit.column, edit.value]))
      plan.push({
        id: `update:${group.key}`,
        label: `Update row ${group.key}`,
        mutation: { action: "update", records: [record], target: { primaryKey, keys: [group.rowKey] } },
      })
    }
  }

  if (primaryKey && pending.removals.length > 0) {
    const keys = pending.removals.map((removal) => removal.rowKey)
    plan.push({
      id: "delete",
      label: `Delete ${keys.length} row${keys.length === 1 ? "" : "s"}`,
      mutation: { action: "delete", target: { primaryKey, keys } },
    })
  }

  return plan
}

/** The plan bound to one connection, ready to run in order. */
export function pendingSteps(plan: PlanItem[], config: DatabaseConfig): PendingStep[] {
  return plan.map((item) => ({
    id: item.id,
    label: item.label,
    run: (table) =>
      "action" in item ? api.alterTable(config, table, item.action) : api.mutateRows(config, table, item.mutation),
  }))
}
