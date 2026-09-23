import type { ColumnAnalysis } from "@/lib/types"

/**
 * Excel serial dates count days from 1900-01-01, and Excel wrongly treats 1900
 * as a leap year, so serials past Feb 1900 need one day subtracted.
 */
export function excelSerialToDate(serial: number): Date {
  if (!Number.isFinite(serial)) throw new Error(`Invalid Excel serial date: ${serial}`)
  const adjusted = serial > 59 ? serial - 1 : serial
  return new Date(Date.UTC(1900, 0, 1) + (adjusted - 1) * 86_400_000)
}

/** Excel stores times as a fraction of a day, so parsed instants carry sub-second drift. */
export function roundToSecond(date: Date): Date {
  return new Date(Math.round(date.getTime() / 1000) * 1000)
}

/**
 * Formats a date as the literal the target column accepts. Rounding to the
 * nearest second keeps a 17:45:00 cell from being written as 17:44:59.
 */
export function formatDateForDatabase(date: Date, columnType = "DATE"): string {
  const instant = roundToSecond(date)
  const day = instant.toISOString().slice(0, 10)
  return /DATETIME|TIMESTAMP/.test(columnType.toUpperCase()) ? `${day} ${instant.toISOString().slice(11, 19)}` : day
}

/**
 * Integer column types. Word boundaries matter: `POINT` and `BIGSERIAL` must
 * not be read as `INT`/`SERIAL`, and `INTEGER` must not be read as `INT`.
 */
const INTEGER_TYPE = /\b(TINYINT|SMALLINT|MEDIUMINT|BIGINT|SERIAL|BIGSERIAL|INTEGER|INT)\b/
const DECIMAL_TYPE = /DECIMAL|NUMERIC|REAL|FLOAT|DOUBLE|MONEY/

/**
 * Coerces one cell to the value a column of `type` expects. Shared by the
 * import path and by the dataset cast/fill operations, so a value written by
 * the grid matches a value written by the importer.
 *
 * Integer types truncate toward zero, which is what `CAST(x AS INT)` does. A
 * fractional value must never reach an integer column: PostgreSQL rejects it,
 * and SQLite would silently store a REAL in an INTEGER-affinity column.
 */
export function coerceCell(value: unknown, type: string): unknown {
  if (value === null || value === undefined || value === "") return null

  const upper = type.toUpperCase()

  if (/DATE|TIMESTAMP|DATETIME/.test(upper)) {
    if (value instanceof Date) return formatDateForDatabase(value, upper)
    if (typeof value === "number") return formatDateForDatabase(excelSerialToDate(value), upper)
    const parsed = new Date(String(value))
    return isNaN(parsed.getTime()) ? null : formatDateForDatabase(parsed, upper)
  }

  if (/BOOLEAN|BIT/.test(upper)) {
    if (typeof value === "boolean") return value
    const text = String(value).toLowerCase()
    if (["true", "yes", "1", "y"].includes(text)) return true
    if (["false", "no", "0", "n"].includes(text)) return false
    return Boolean(value)
  }

  if (INTEGER_TYPE.test(upper)) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null
  }

  if (DECIMAL_TYPE.test(upper)) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return String(value)
}

/** Coerces one cell to the value the detected column type expects. */
export function transformCellValue(value: unknown, column: ColumnAnalysis): unknown {
  return coerceCell(value, column.suggestedType)
}

export function transformDataRows(data: unknown[][], columns: ColumnAnalysis[]): unknown[][] {
  return data.map((row) =>
    row.map((cell, index) => {
      const column = columns[index]
      return column ? transformCellValue(cell, column) : cell
    }),
  )
}
