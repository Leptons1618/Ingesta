/**
 * Writing a browser grid into a database.
 *
 * Three modes, one code path, because the interesting part is identical in all
 * of them: turn a `Grid` into a table definition, coerce every cell to the type
 * its column declares, and hand the rows to `insert-data`.
 *
 * `replace` is deliberately delete-then-insert inside the caller's guardrail
 * flow rather than a table rebuild — the table's own keys and indexes survive,
 * which is what a user expects from "replace the contents".
 */

import { api, type ApiResult } from "@/lib/api"
import { gridToRows, gridToTableConfig } from "@/lib/operations"
import type { DatabaseConfig, Grid } from "@/lib/types"
import { errorMessage } from "@/lib/utils"

export type PushMode = "create" | "append" | "replace"

export interface PushResult {
  tableName: string
  rowsWritten: number
  /** True when the table was created by this call. */
  created: boolean
}

export async function pushGrid({
  config,
  grid,
  tableName,
  mode,
}: {
  config: DatabaseConfig
  grid: Grid
  tableName: string
  mode: PushMode
}): Promise<ApiResult<PushResult>> {
  if (grid.columns.length === 0) return { ok: false, error: "The grid has no columns to write" }
  if (!tableName.trim()) return { ok: false, error: "A table name is required" }

  const rows = gridToRows(grid)
  const columnNames = grid.columns.map((column) => column.name)

  try {
    if (mode === "create") {
      const primaryKey = grid.columns.find((column) => column.isPrimaryKey)?.name
      const created = await api.createTable(config, gridToTableConfig(grid, tableName, primaryKey))
      if (!created.ok) return { ok: false, error: created.error }

      if (rows.length === 0) return { ok: true, data: { tableName, rowsWritten: 0, created: true } }

      const inserted = await api.insertData(config, tableName, columnNames, rows)
      if (!inserted.ok) {
        // The table exists but is empty; say so, because the user has to decide
        // whether to drop it or fill it.
        return { ok: false, error: `Table "${tableName}" was created, but the rows were rejected: ${inserted.error}` }
      }

      return { ok: true, data: { tableName, rowsWritten: inserted.data.insertedRows, created: true } }
    }

    if (mode === "replace") {
      const cleared = await api.truncateTable(config, tableName)
      if (!cleared.ok) return { ok: false, error: cleared.error }
    }

    if (rows.length === 0) return { ok: true, data: { tableName, rowsWritten: 0, created: false } }

    const inserted = await api.insertData(config, tableName, columnNames, rows)
    if (!inserted.ok) return { ok: false, error: inserted.error }

    return { ok: true, data: { tableName, rowsWritten: inserted.data.insertedRows, created: false } }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}
