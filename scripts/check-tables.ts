/**
 * Table-studio check. The page's pending-change model — the plan, its order, its
 * guardrail verdicts, and what a stopped apply keeps — driven through `lib/api`
 * and the real route handlers against a throwaway SQLite file.
 *
 *   bun scripts/check-tables.ts
 *
 * The routes are handed the same `fetch` calls the browser makes, so `api` →
 * route → `lib/db` → engine is exercised end to end without a server.
 */
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { POST as alterTablePost } from "@/app/api/alter-table/route"
import { POST as getTablesPost } from "@/app/api/get-tables/route"
import { POST as previewPost } from "@/app/api/preview-table/route"
import { POST as runQueryPost } from "@/app/api/run-query/route"
import { POST as snapshotsPost } from "@/app/api/snapshots/route"
import { POST as structurePost } from "@/app/api/table-structure/route"
import { POST as tableAdminPost } from "@/app/api/table-admin/route"
import { POST as tableRowsPost } from "@/app/api/table-rows/route"
import {
  addRow,
  assessPending,
  coerceCell,
  emptyPending,
  keepOnly,
  mergeAssessments,
  pendingCount,
  pendingEntries,
  pendingPlan,
  pendingSteps,
  recordEdit,
  removeRow,
  setColumnAdd,
  setColumnDrop,
  setNewRowValue,
  type PendingChanges,
} from "@/components/tables/pending-changes"
import { api } from "@/lib/api"
import { createTable, insertData, previewTable } from "@/lib/db"
import type { DatabaseConfig } from "@/lib/types"

const ROUTES: Record<string, (request: Request) => Promise<Response>> = {
  "/api/alter-table": alterTablePost,
  "/api/get-tables": getTablesPost,
  "/api/preview-table": previewPost,
  "/api/run-query": runQueryPost,
  "/api/snapshots": snapshotsPost,
  "/api/table-structure": structurePost,
  "/api/table-admin": tableAdminPost,
  "/api/table-rows": tableRowsPost,
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname
  const handler = ROUTES[path]
  if (!handler) throw new Error(`no stub route for ${path}`)
  return handler(new Request(`http://stub${path}`, init))
}) as typeof fetch

const directory = mkdtempSync(join(tmpdir(), "ingesta-tables-"))
const config: DatabaseConfig = { id: "check", name: "check", type: "sqlite", database: join(directory, "tables.db") }

/** Runs a plan the way the page does, and reports where it stopped. */
async function runPlan(pending: PendingChanges, primaryKey: string | null, table: string) {
  const steps = pendingSteps(pendingPlan(pending, primaryKey), config)
  let applied = 0
  let stoppedAt = steps.length
  let failure: string | null = null

  for (let index = 0; index < steps.length; index += 1) {
    const result = await steps[index].run(table)
    if (!result.ok) {
      stoppedAt = index
      failure = `${steps[index].label} failed: ${result.error}`
      break
    }
    applied += 1
  }

  return { applied, stoppedAt, failure, steps }
}

try {
  await createTable(config, {
    tableName: "orders",
    primaryKey: "id",
    columns: [
      { name: "id", suggestedType: "INT", nullable: false, samples: [1], uniqueValues: 3, nullCount: 0, totalCount: 3 },
      { name: "code", suggestedType: "VARCHAR(20)", nullable: false, samples: ["A"], uniqueValues: 3, nullCount: 0, totalCount: 3 },
      { name: "name", suggestedType: "VARCHAR(255)", nullable: true, samples: ["Ada"], uniqueValues: 3, nullCount: 0, totalCount: 3 },
      { name: "amount", suggestedType: "DECIMAL(10,2)", nullable: true, samples: [12.5], uniqueValues: 3, nullCount: 1, totalCount: 3 },
    ],
  })
  await insertData(config, "orders", ["id", "code", "name", "amount"], [
    [1, "A", "Ada", 12.5],
    [2, "B", "Bo", 3.25],
    [3, "C", "Cleo", null],
  ])

  // Ingesta's own create-table path always adds an auto id key, so the keyless
  // case the studio has to refuse to edit comes from raw DDL.
  const ddl = await api.runQuery(config, "CREATE TABLE events (kind VARCHAR(50), at VARCHAR(50))", { allowWrite: true })
  if (!ddl.ok) throw new Error(ddl.error)
  await insertData(config, "events", ["kind", "at"], [
    ["click", "2024-01-01"],
    ["view", "2024-01-02"],
  ])

  /* ------------------------------------------------------ pull the rows */

  const structure = await api.getTableStructure(config, "orders")
  if (!structure.ok) throw new Error(structure.error)
  const primaryKey = structure.data.find((column) => column.isPrimaryKey)?.name ?? null
  assert.equal(primaryKey, "id", "the primary key comes from getTableStructure")

  const preview = await api.previewTable(config, "orders", { limit: 200, offset: 0 })
  if (!preview.ok) throw new Error(preview.error)
  assert.deepEqual(preview.data.columns, ["id", "code", "name", "amount"])
  assert.equal(preview.data.totalRows, 3)

  /* --------------------------------------------------- record a plan */

  const idIndex = preview.data.columns.indexOf("id")
  const nameIndex = preview.data.columns.indexOf("name")

  let pending = emptyPending()
  pending = recordEdit(pending, {
    rowKey: preview.data.data[1][idIndex],
    column: "name",
    value: coerceCell("Bo Diddley", "VARCHAR(255)"),
    previous: preview.data.data[1][nameIndex],
  })
  pending = recordEdit(pending, {
    rowKey: preview.data.data[1][idIndex],
    column: "amount",
    value: coerceCell("7", "DECIMAL(10,2)"),
    previous: 3.25,
  })
  // Retyping what the database already holds must not become a change.
  pending = recordEdit(pending, { rowKey: preview.data.data[0][idIndex], column: "code", value: "A", previous: "A" })
  assert.equal(pending.edits.length, 2, "a no-op edit is not recorded")
  assert.equal(coerceCell("7", "INT"), 7, "numbers come back as numbers")
  assert.equal(coerceCell("", "VARCHAR(20)"), null, "an emptied cell becomes NULL")
  assert.equal(coerceCell("yes", "BOOLEAN"), true, "booleans are coerced")

  pending = setColumnAdd(pending, { name: "shipped_at", type: "DATE", nullable: true })
  pending = addRow(pending)
  const insertId = pending.inserts[0].id
  pending = setNewRowValue(pending, insertId, "id", 4)
  pending = setNewRowValue(pending, insertId, "code", "D")
  pending = setNewRowValue(pending, insertId, "name", "Dee")
  pending = setNewRowValue(pending, insertId, "amount", 9.5)
  pending = removeRow(pending, { rowKey: 3, label: "id=3, code=C, name=Cleo" })

  assert.equal(pendingCount(pending), 5, "two edits, one column, one insert, one delete")
  assert.deepEqual(
    [...new Set(pendingEntries(pending, "orders", primaryKey).map((entry) => entry.family))],
    ["Schema", "Rows"],
    "the review list covers every family",
  )

  /* ---------------------------------------------------- the guardrails */

  const merged = mergeAssessments(assessPending(pending, "orders", preview.data.totalRows), "orders", pendingCount(pending))
  assert.equal(merged.risk, "destructive", "deleting rows is destructive")
  assert.equal(merged.warnings.length > 0, true, "the confirm dialog has warnings to list")

  const droppedPlan = setColumnDrop(pending, "amount")
  const dropped = mergeAssessments(
    assessPending(droppedPlan, "orders", preview.data.totalRows),
    "orders",
    pendingCount(droppedPlan),
  )
  assert.equal(dropped.risk, "destructive")
  assert.equal(dropped.confirmation, "amount", "dropping a column demands the column name be typed")

  /* ---------------------------------------------------- apply the plan */

  const run = await runPlan(pending, primaryKey, "orders")
  assert.equal(run.failure, null, `the plan runs clean: ${run.failure}`)
  // One call per change: the column, the insert, one update for the row that
  // carries both edits, and the delete.
  assert.equal(run.applied, 4, "the plan runs as four calls")

  /* --------------------------------------------- re-fetch and verify it */

  const after = await api.previewTable(config, "orders", { limit: 200, offset: 0, orderBy: "id", direction: "asc" })
  if (!after.ok) throw new Error(after.error)
  assert.equal(after.data.totalRows, 3, "3 rows - 1 deleted + 1 inserted")
  assert.deepEqual(after.data.columns, ["id", "code", "name", "amount", "shipped_at"], "the new column is there")

  const byId = new Map(after.data.data.map((row) => [row[after.data.columns.indexOf("id")], row]))
  assert.equal(byId.has(3), false, "the deleted row is gone")
  assert.equal(byId.get(2)?.[after.data.columns.indexOf("name")], "Bo Diddley", "the edited cell round-tripped")
  assert.equal(byId.get(2)?.[after.data.columns.indexOf("amount")], 7, "the numeric edit kept its type")
  assert.equal(byId.get(4)?.[after.data.columns.indexOf("code")], "D", "the new row was inserted")
  assert.equal(byId.get(4)?.[after.data.columns.indexOf("shipped_at")], null, "the untouched new column is NULL")

  const afterStructure = await api.getTableStructure(config, "orders")
  if (!afterStructure.ok) throw new Error(afterStructure.error)
  assert.equal(afterStructure.data.some((column) => column.name === "shipped_at"), true, "the structure agrees")

  /* ----------------------------------- a failure keeps what is left */

  let broken = emptyPending()
  broken = setColumnAdd(broken, { name: "shipped_at", type: "TEXT", nullable: true })
  broken = addRow(broken)
  broken = setNewRowValue(broken, broken.inserts[0].id, "code", "E")

  const brokenRun = await runPlan(broken, primaryKey, "orders")
  assert.equal(brokenRun.applied, 0, "the duplicate column stops the plan at step one")
  assert.match(String(brokenRun.failure), /Add column "shipped_at" failed/)

  const remaining = keepOnly(broken, new Set(brokenRun.steps.slice(brokenRun.stoppedAt).map((step) => step.id)))
  assert.equal(pendingCount(remaining), 2, "the change that failed and the one after it are both still pending")
  assert.equal(remaining.adds.length, 1, "the rejected column is kept so it can be fixed or removed")
  assert.equal(remaining.inserts.length, 1, "the insert that never ran is still pending")

  /* ----------------------------------------- a table without a key */

  const eventStructure = await api.getTableStructure(config, "events")
  if (!eventStructure.ok) throw new Error(eventStructure.error)
  assert.equal(
    eventStructure.data.find((column) => column.isPrimaryKey)?.name ?? null,
    null,
    "a table with no primary key reports none",
  )
  assert.equal(
    pendingPlan(pending, null).some((item) => "mutation" in item && item.mutation.action !== "insert"),
    false,
    "with no primary key the plan never addresses a single row",
  )

  /* ------------------------------------------- snapshot round trip */

  const snapshot = await api.createSnapshot(config, "orders")
  if (!snapshot.ok) throw new Error(snapshot.error)
  assert.equal(snapshot.data.rowCount, 3)

  await api.truncateTable(config, "orders")
  const emptied = await previewTable(config, "orders", { limit: 10 })
  assert.equal(emptied.totalRows, 0, "truncate emptied the table")

  const restored = await api.restoreSnapshot(config, snapshot.data.name)
  if (!restored.ok) throw new Error(restored.error)
  assert.equal(restored.data.restoredRows, 3, "restore puts the rows back")

  const listed = await api.listSnapshots(config)
  if (!listed.ok) throw new Error(listed.error)
  assert.equal(listed.data.some((entry) => entry.name === snapshot.data.name), true, "the snapshot is listed")

  /* --------------------------------------------------------- drop */

  const droppedTable = await api.dropTable(config, "events")
  if (!droppedTable.ok) throw new Error(droppedTable.error)
  const tables = await api.getTables(config)
  if (!tables.ok) throw new Error(tables.error)
  assert.equal(tables.data.some((table) => table.name === "events"), false, "the dropped table is gone from the picker")

  console.log("check-tables: all assertions passed")
} finally {
  rmSync(directory, { recursive: true, force: true })
}
