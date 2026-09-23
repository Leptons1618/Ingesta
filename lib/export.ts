/**
 * Turning a grid into a file, and a file back into a grid.
 *
 * The Excel reader is the same one the import workflow uses, so a file that
 * round-trips through an export and an import is parsed identically both times.
 */

import * as XLSX from "xlsx"

import { parseWorkbooks } from "@/lib/excel"
import { analyzeColumn } from "@/lib/schema"
import { downloadFile } from "@/lib/storage"
import type { Grid } from "@/lib/types"

export type ExportFormat = "csv" | "json" | "xlsx"

export const EXPORT_FORMATS: Array<{ value: ExportFormat; label: string; extension: string; description: string }> = [
  { value: "csv", label: "CSV", extension: "csv", description: "Comma separated; opens in any spreadsheet." },
  { value: "json", label: "JSON", extension: "json", description: "One object per row, keyed by column name." },
  { value: "xlsx", label: "Excel workbook", extension: "xlsx", description: "A real .xlsx file with a header row." },
]

/**
 * RFC 4180 says a field only needs quoting when it holds the delimiter, a quote
 * or a newline. Leading and trailing whitespace is quoted too: unquoted padding
 * survives a strict parser but is silently trimmed by plenty of tools, and this
 * export is meant to round-trip unchanged.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  const text = value instanceof Date ? value.toISOString() : String(value)
  return /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function gridToCsv(grid: Grid): string {
  const header = grid.columns.map((column) => csvCell(column.name)).join(",")
  const body = grid.rows.map((row) => row.map(csvCell).join(","))
  return [header, ...body].join("\r\n")
}

export function gridToJson(grid: Grid): string {
  const records = grid.rows.map((row) => {
    const record: Record<string, unknown> = {}
    grid.columns.forEach((column, index) => {
      record[column.name] = row[index] ?? null
    })
    return record
  })
  return JSON.stringify(records, null, 2)
}

function gridToWorkbook(grid: Grid): XLSX.WorkBook {
  const sheet = XLSX.utils.aoa_to_sheet([
    grid.columns.map((column) => column.name),
    ...grid.rows.map((row) => grid.columns.map((_, index) => row[index] ?? null)),
  ])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, "data")
  return workbook
}

export function exportGrid(grid: Grid, name: string, format: ExportFormat): void {
  if (format === "csv") {
    downloadFile(safeFileName(name, "csv"), gridToCsv(grid), "text/csv;charset=utf-8")
    return
  }

  if (format === "json") {
    downloadFile(safeFileName(name, "json"), gridToJson(grid), "application/json")
    return
  }

  const output = XLSX.write(gridToWorkbook(grid), { bookType: "xlsx", type: "array" }) as ArrayBuffer
  downloadFile(
    safeFileName(name, "xlsx"),
    new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  )
}

/** A filename that is safe on every platform and still recognisable. */
export function safeFileName(name: string, extension: string): string {
  const stem = name
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80)
  return `${stem || "export"}.${extension}`
}

export interface ImportedSheet {
  name: string
  grid: Grid
}

/**
 * Reads a workbook back into grids. Column types come from `analyzeColumn`, the
 * same analyzer the import workflow uses, so a file exported and re-imported
 * detects identically both times.
 */
export async function readGridsFromFile(file: File): Promise<{ sheets: ImportedSheet[]; errors: string[] }> {
  const parsed = await parseWorkbooks([file])
  const sheets: ImportedSheet[] = []

  for (const workbook of parsed.files) {
    for (const sheet of workbook.sheets) {
      sheets.push({
        name: sheet.name,
        grid: {
          columns: sheet.headers.map((header, index) => {
            const analysis = analyzeColumn(
              header,
              sheet.data.map((row) => row[index]),
            )
            return { name: header, type: analysis.suggestedType, nullable: analysis.nullable }
          }),
          rows: sheet.data,
        },
      })
    }
  }

  return { sheets, errors: parsed.errors }
}
