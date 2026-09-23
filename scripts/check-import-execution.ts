/**
 * Import-execution check. The batching policy and the guidance layer, plus the
 * real insert route against a throwaway SQLite file: one transaction when no
 * execution options are sent, one transaction per batch when they are, and the
 * telemetry the wizard reads back.
 *
 *   bun scripts/check-import-execution.ts
 *
 * The route is handed the same `fetch` call the browser makes, so `postJson` →
 * route → policy → `lib/db` → engine is exercised end to end without a server.
 */
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { POST as insertDataPost } from "@/app/api/insert-data/route"
import { createTable, previewTable } from "@/lib/db"
import { DEFAULT_INSERT_EXECUTION, MAX_BATCH_SIZE, normalizeInsertExecution, prepareInsertRows } from "@/lib/import-execution"
import type { ColumnAnalysis, DatabaseConfig, InsertExecutionOptions, InsertReport, TableCreationConfig } from "@/lib/types"
import { buildWorkflowGuidance, type WorkflowSnapshot } from "@/lib/workflow-insights"

const directory = mkdtempSync(join(tmpdir(), "ingesta-check-"))
const config: DatabaseConfig = {
  id: "check",
  name: "check",
  type: "sqlite",
  database: join(directory, "check.db"),
}

const column = (name: string, suggestedType: string, nullable = true): ColumnAnalysis => ({
  name,
  suggestedType,
  nullable,
  samples: [],
  uniqueValues: 0,
  nullCount: 0,
  totalCount: 0,
})

const table = (tableName: string, columns: ColumnAnalysis[]): TableCreationConfig => ({ tableName, columns })

/** The route, called the way the browser calls it. */
async function postInsert(body: unknown): Promise<{ status: number; body: InsertReport & { success: boolean; message?: string } }> {
  const response = await insertDataPost(
    new Request("http://stub/api/insert-data", { method: "POST", body: JSON.stringify(body) }),
  )
  return { status: response.status, body: (await response.json()) as InsertReport & { success: boolean; message?: string } }
}

try {
  // --- Policy -----------------------------------------------------------------

  const none = normalizeInsertExecution(undefined)
  assert.equal(none.batchSize, 0, "no execution options means one transaction, not the wizard's default")
  assert.equal(none.blankCells, "null")
  assert.equal(none.continueOnBatchError, false)
  assert.equal(normalizeInsertExecution({ batchSize: 999_999 }).batchSize, MAX_BATCH_SIZE, "batch size is bounded")
  assert.equal(normalizeInsertExecution({ batchSize: -5 }).batchSize, 0)
  assert.equal(normalizeInsertExecution({ batchSize: 2.7 }).batchSize, 2)
  assert.equal(DEFAULT_INSERT_EXECUTION.batchSize, 500, "the wizard opens with a bounded batch size")

  const trimAndConvert: InsertExecutionOptions = {
    ...DEFAULT_INSERT_EXECUTION,
    batchSize: 0,
    trimStrings: true,
    convertTypes: true,
  }
  const prepared = prepareInsertRows(
    [
      [" 12.7 ", "  Ada  "],
      ["3", ""],
      ["", "Grace"],
    ],
    ["INT", "VARCHAR(20)"],
    trimAndConvert,
  )
  assert.deepEqual(prepared.rows[0], [12, "Ada"], "text is trimmed and an INT column truncates toward zero")
  assert.deepEqual(prepared.rows[1], [3, null], "a blank cell becomes NULL, never a placeholder value")
  assert.equal(prepared.skippedRows, 0, "blank cells are kept as NULL unless the policy says otherwise")

  const skipRows = prepareInsertRows(
    [
      ["x", "y"],
      ["z", null],
      [null, "w"],
    ],
    undefined,
    { ...DEFAULT_INSERT_EXECUTION, batchSize: 0, blankCells: "skip-row" },
  )
  assert.equal(skipRows.rows.length, 1, "a row with a blank cell is dropped when asked")
  assert.equal(skipRows.skippedRows, 2)
  assert.match(skipRows.warnings[0], /row 2, row 3/, "the warning names the rows it dropped")

  // --- The route, against a real database -------------------------------------

  await createTable(config, table("compat", [column("code", "INT", false), column("label", "VARCHAR(20)")]))
  await createTable(config, table("chunked_stop", [column("code", "INT", false), column("label", "VARCHAR(20)")]))
  await createTable(config, table("chunked_go", [column("code", "INT", false), column("label", "VARCHAR(20)")]))
  await createTable(config, table("blanks", [column("a", "VARCHAR(20)"), column("b", "VARCHAR(20)")]))

  // A caller that sends no execution options keeps the original contract: one
  // transaction for the whole request, all or nothing.
  const legacy = await postInsert({
    config,
    tableName: "compat",
    columnNames: ["code", "label"],
    data: [
      [1, "a"],
      [2, "b"],
      [null, "c"],
    ],
  })
  assert.equal(legacy.body.success, false, "a NOT NULL violation still fails the whole request")
  assert.equal((await previewTable(config, "compat", 10)).totalRows, 0, "nothing was committed")

  const atomic = await postInsert({
    config,
    tableName: "compat",
    columnNames: ["code", "label"],
    data: [
      [1, "a"],
      [2, "b"],
    ],
  })
  assert.equal(atomic.body.success, true)
  assert.equal(atomic.body.insertedRows, 2)
  assert.equal(atomic.body.totalBatches, 1, "without a batch size the whole insert is one batch")
  assert.equal(atomic.body.failedBatches, 0)

  // Batched: a failed batch stops the run, and what already committed stays.
  const stopped = await postInsert({
    config,
    tableName: "chunked_stop",
    columnNames: ["code", "label"],
    data: [
      [1, "a"],
      [2, "b"],
      [3, "c"],
      [null, "d"],
      [5, "e"],
      [6, "f"],
    ],
    execution: { batchSize: 2 },
  })
  assert.equal(stopped.body.success, false, "a failed batch fails the request")
  assert.equal(stopped.body.totalBatches, 3)
  assert.equal(stopped.body.processedBatches, 1)
  assert.equal(stopped.body.failedBatches, 1)
  assert.equal(stopped.body.batchErrors[0].batch, 2)
  assert.equal(stopped.body.insertedRows, 2, "the batch before the failure is still committed")
  assert.match(stopped.body.message ?? "", /1 of 3 batches failed/)
  assert.match(stopped.body.message ?? "", /stopped at batch 2/)
  assert.equal((await previewTable(config, "chunked_stop", 10)).totalRows, 2, "the run stopped at the failed batch")

  // Batched with continue-on-error: the later batch still runs.
  const continued = await postInsert({
    config,
    tableName: "chunked_go",
    columnNames: ["code", "label"],
    data: [
      [1, "a"],
      [2, "b"],
      [3, "c"],
      [null, "d"],
      [5, "e"],
      [null, null],
    ],
    execution: { batchSize: 2, continueOnBatchError: true },
  })
  assert.equal(continued.body.success, false)
  assert.equal(continued.body.totalBatches, 3, "the all-blank row is dropped before the rows are cut into batches")
  assert.equal(continued.body.processedBatches, 2)
  assert.equal(continued.body.failedBatches, 1)
  assert.equal(continued.body.skippedRows, 1, "the all-blank row is reported as skipped")
  assert.equal(continued.body.insertedRows, 3)
  assert.equal((await previewTable(config, "chunked_go", 10)).totalRows, 3, "batches after the failure still landed")

  // Empty rows: skipped by default, written when the operator says so.
  const skipBlank = await postInsert({
    config,
    tableName: "blanks",
    columnNames: ["a", "b"],
    data: [[null, null]],
  })
  assert.equal(skipBlank.body.insertedRows, 0)
  assert.equal(skipBlank.body.skippedRows, 1)

  const writeBlank = await postInsert({
    config,
    tableName: "blanks",
    columnNames: ["a", "b"],
    data: [[null, null]],
    execution: { skipEmptyRows: false },
  })
  assert.equal(writeBlank.body.insertedRows, 1, "skip-empty-rows off writes the blank row as NULLs")
  assert.equal((await previewTable(config, "blanks", 10)).totalRows, 1)

  // The server applies the policy itself: types, trimming and skipped rows.
  const converted = await postInsert({
    config,
    tableName: "blanks",
    columnNames: ["a", "b"],
    columnTypes: ["INT", "DECIMAL(10,2)"],
    data: [[" 42 ", " 7.9 "], ["", ""]],
    execution: { convertTypes: true, trimStrings: true, blankCells: "skip-row", skipEmptyRows: true },
  })
  assert.equal(converted.body.insertedRows, 1)
  assert.equal(converted.body.skippedRows, 1, "the row with blank cells is dropped")
  const convertedPreview = await previewTable(config, "blanks", 10)
  const convertedRow = convertedPreview.data.at(-1)
  assert.equal(
    Number(convertedRow?.[convertedPreview.columns.indexOf("a")]),
    42,
    "the INT column got a number, not the string that was posted",
  )
  assert.equal(Number(convertedRow?.[convertedPreview.columns.indexOf("b")]), 7.9)

  // --- Guidance ---------------------------------------------------------------

  const empty: WorkflowSnapshot = {
    step: 1,
    files: 0,
    sheets: 0,
    rows: 0,
    connectionName: null,
    connectionType: null,
    selectedSheets: 0,
    selectedRows: 0,
    createdTables: 0,
    failedTables: 0,
    recentRuns: 0,
    error: null,
    busy: false,
  }
  assert.equal(buildWorkflowGuidance(empty).readiness, 0)
  assert.match(buildWorkflowGuidance(empty).blockers[0], /Select the workbooks/)

  const done: WorkflowSnapshot = {
    ...empty,
    step: 7,
    files: 1,
    sheets: 2,
    rows: 20,
    connectionName: "local",
    connectionType: "sqlite",
    selectedSheets: 2,
    selectedRows: 20,
    createdTables: 2,
  }
  assert.equal(buildWorkflowGuidance(done).readiness, 100, "a finished run is fully ready")
  assert.deepEqual(buildWorkflowGuidance(done).blockers, [])

  const stranded: WorkflowSnapshot = { ...empty, step: 3, files: 1, sheets: 2, rows: 20 }
  assert.equal(buildWorkflowGuidance(stranded).readiness, 25, "files and the analysis are in place, nothing else")
  assert.match(buildWorkflowGuidance(stranded).blockers[0], /connection/i)

  const bigRun: WorkflowSnapshot = { ...empty, step: 4, files: 1, sheets: 1, rows: 40_000, selectedSheets: 1, selectedRows: 40_000 }
  assert.match(buildWorkflowGuidance(bigRun).recommendations[0], /batch size/, "a large queue is told about batching")

  const partialRun: WorkflowSnapshot = { ...done, step: 6, failedTables: 1 }
  assert.match(buildWorkflowGuidance(partialRun).blockers.join(" "), /failed/, "a failed sheet outranks the stage hint")

  console.log("check-import-execution: all assertions passed")
} finally {
  rmSync(directory, { recursive: true, force: true })
}
