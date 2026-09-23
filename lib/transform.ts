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

/** Coerces one cell to the value the detected column type expects. */
export function transformCellValue(value: unknown, column: ColumnAnalysis): unknown {
  if (value === null || value === undefined || value === "") return null

  const type = column.suggestedType.toUpperCase()

  if (/DATE|TIMESTAMP|DATETIME/.test(type)) {
    if (value instanceof Date) return formatDateForDatabase(value, type)
    if (typeof value === "number") return formatDateForDatabase(excelSerialToDate(value), type)
    const parsed = new Date(String(value))
    return isNaN(parsed.getTime()) ? null : formatDateForDatabase(parsed, type)
  }

  if (/BOOLEAN|BIT/.test(type)) {
    if (typeof value === "boolean") return value
    const text = String(value).toLowerCase()
    if (["true", "yes", "1", "y"].includes(text)) return true
    if (["false", "no", "0", "n"].includes(text)) return false
    return Boolean(value)
  }

  if (/INT|DECIMAL|NUMERIC|REAL|FLOAT|DOUBLE/.test(type)) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return String(value)
}

export function transformDataRows(data: unknown[][], columns: ColumnAnalysis[]): unknown[][] {
  return data.map((row) =>
    row.map((cell, index) => {
      const column = columns[index]
      return column ? transformCellValue(cell, column) : cell
    }),
  )
}
