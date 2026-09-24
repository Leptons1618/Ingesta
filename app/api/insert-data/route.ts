import { insertDataInBatches } from "@/lib/db"
import { RouteFailure, jsonRoute, readJson } from "@/lib/http"
import { normalizeInsertExecution, prepareInsertRows } from "@/lib/import-execution"
import type { DatabaseConfig, InsertExecutionOptions, InsertReport } from "@/lib/types"

/** What a failed run says in one line, telemetry included. */
function failureMessage(report: InsertReport): string {
  const first = report.batchErrors[0]
  const stopped = report.processedBatches + report.failedBatches < report.totalBatches

  return [
    `${report.failedBatches} of ${report.totalBatches} batches failed`,
    `${report.insertedRows.toLocaleString()} rows were written`,
    stopped ? `the run stopped at batch ${first.batch}` : null,
    first.message,
  ]
    .filter(Boolean)
    .join(" · ")
}

/**
 * Writes rows into a table, optionally in batches.
 *
 * `execution` is optional and additive: without it the whole insert is one
 * transaction, which is the behaviour every earlier caller has. With it, the
 * rows are cut into `batchSize` chunks, each chunk is its own transaction, and
 * the response reports the batch accounting, the rows the policy skipped and how
 * long the write took. A failed batch is a failed request — with the telemetry
 * attached, because "1 of 9 batches failed" is only actionable next to "4,000
 * rows were written".
 */
export async function POST(request: Request) {
  return jsonRoute(async (): Promise<InsertReport> => {
    const { config, tableName, columnNames, data, columnTypes, execution } = await readJson<{
      config: DatabaseConfig
      tableName: string
      columnNames: string[]
      data: unknown[][]
      /** The type each column was configured with; only read when `convertTypes` is on. */
      columnTypes?: string[]
      execution?: Partial<InsertExecutionOptions>
    }>(request)

    const startedAt = Date.now()
    const policy = normalizeInsertExecution(execution)
    const prepared = prepareInsertRows(data, columnTypes, policy)

    const result = await insertDataInBatches(config, tableName, columnNames, prepared.rows, {
      batchSize: policy.batchSize,
      continueOnBatchError: policy.continueOnBatchError,
      skipEmptyRows: policy.skipEmptyRows,
    })

    const batchErrors = result.batches
      .filter((batch) => batch.error)
      .map((batch) => ({ batch: batch.batch, rows: batch.rows, message: batch.error ?? "unknown error" }))

    const report: InsertReport = {
      insertedRows: result.insertedRows,
      skippedRows: result.skippedRows + prepared.skippedRows,
      totalBatches: result.totalBatches,
      processedBatches: result.batches.filter((batch) => !batch.error).length,
      failedBatches: batchErrors.length,
      batchErrors,
      warnings: prepared.warnings,
      durationMs: Date.now() - startedAt,
    }

    if (batchErrors.length > 0) throw new RouteFailure(failureMessage(report), report)

    return report
  })
}
