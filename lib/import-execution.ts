/**
 * The insert execution policy, in one place.
 *
 * The route, the wizard and the check scripts all read the same defaults and the
 * same row rules from here, so what the panel shows is what the server does. The
 * rules are pure functions over plain rows — no session, no driver — because the
 * interesting part is the decision, not the write.
 *
 * What is *not* here: inventing a value for a missing one. A blank cell becomes
 * NULL; if the operator wants it gone instead, the whole row is dropped. The old
 * `handleNulls: "default"` behaviour (blank becomes `0`, `false` or today's date)
 * was removed on purpose and is not coming back through this door.
 */

import { coerceCell } from "@/lib/transform"
import type { InsertExecutionOptions } from "@/lib/types"

/** Bounded so one request cannot ask for a transaction per row. */
export const MAX_BATCH_SIZE = 5000

/** What the wizard opens with. The route only applies these when asked. */
export const DEFAULT_INSERT_EXECUTION: InsertExecutionOptions = {
  batchSize: 500,
  blankCells: "null",
  skipEmptyRows: true,
  trimStrings: false,
  convertTypes: true,
  continueOnBatchError: false,
}

/**
 * Fills in a partial policy. A missing `batchSize` means "one transaction", not
 * "the wizard's default": a caller that sends no execution options must keep the
 * atomic behaviour it has always had.
 */
export function normalizeInsertExecution(input?: Partial<InsertExecutionOptions> | null): InsertExecutionOptions {
  const requested = Number(input?.batchSize ?? 0)
  const batchSize =
    Number.isFinite(requested) && requested > 0 ? Math.min(Math.trunc(requested), MAX_BATCH_SIZE) : 0

  return {
    batchSize,
    blankCells: input?.blankCells === "skip-row" ? "skip-row" : "null",
    skipEmptyRows: input?.skipEmptyRows ?? true,
    trimStrings: input?.trimStrings ?? false,
    convertTypes: input?.convertTypes ?? false,
    continueOnBatchError: input?.continueOnBatchError ?? false,
  }
}

/** A cell that carries no value: NULL, undefined, or an empty string. */
export function isBlankCell(value: unknown): boolean {
  return value === null || value === undefined || value === ""
}

export interface PreparedInsertRows {
  rows: unknown[][]
  /** Rows the policy dropped, and why, so the report can say it out loud. */
  skippedRows: number
  warnings: string[]
}

/** Beyond this the warnings stop naming rows and just report the total. */
const MAX_ROW_WARNINGS = 5

/**
 * Applies the per-cell rules: trimming, blank-cell handling and type coercion.
 * Empty-row removal is *not* here — that rule belongs to the statement builder,
 * which is also the only place that can report how many rows it skipped.
 */
export function prepareInsertRows(
  data: unknown[][],
  columnTypes: string[] | undefined,
  execution: InsertExecutionOptions,
): PreparedInsertRows {
  if (!execution.trimStrings && execution.blankCells === "null" && !execution.convertTypes) {
    return { rows: data, skippedRows: 0, warnings: [] }
  }

  const rows: unknown[][] = []
  const dropped: number[] = []

  data.forEach((row, index) => {
    const cells = row.map((cell, column) => {
      const trimmed = execution.trimStrings && typeof cell === "string" ? cell.trim() : cell
      const type = execution.convertTypes ? columnTypes?.[column] : undefined
      return type ? coerceCell(trimmed, type) : trimmed
    })

    if (execution.blankCells === "skip-row" && cells.some(isBlankCell)) {
      dropped.push(index + 1)
      return
    }

    rows.push(cells)
  })

  const warnings: string[] = []
  if (dropped.length > 0) {
    const named = dropped.slice(0, MAX_ROW_WARNINGS).map((row) => `row ${row}`).join(", ")
    warnings.push(
      dropped.length > MAX_ROW_WARNINGS
        ? `${dropped.length} rows were skipped because a cell was empty (first: ${named}).`
        : `${dropped.length} row${dropped.length === 1 ? "" : "s"} skipped because a cell was empty: ${named}.`,
    )
  }

  return { rows, skippedRows: dropped.length, warnings }
}
