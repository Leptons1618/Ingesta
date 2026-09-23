import * as XLSX from "xlsx"

import type { ExcelFile, ExcelSheet, ParsedWorkbook } from "@/lib/types"
import { errorMessage } from "@/lib/utils"

/**
 * Reads workbooks in the browser. `cellDates` makes the workbook's own date
 * formatting the source of truth for date columns, so type detection never has
 * to guess a date from a bare number.
 */
async function parseWorkbook(file: File): Promise<ExcelFile> {
  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true })

  const sheets = workbook.SheetNames.map((name) => toSheet(name, workbook.Sheets[name])).filter(
    (sheet) => sheet.data.length > 0,
  )

  return { name: file.name, sheets, size: file.size }
}

function toSheet(name: string, worksheet: XLSX.WorkSheet): ExcelSheet {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, blankrows: false })
  const [headerRow = [], ...rows] = grid

  const headers = headerRow.map((cell, index) => String(cell ?? "").trim() || `column_${index + 1}`)
  // Rows are padded to the header width so every row matches the column list.
  const data = rows.map((row) => headers.map((_, index) => row[index] ?? null))

  return { name, headers, data }
}

export async function parseWorkbooks(files: File[]): Promise<ParsedWorkbook> {
  const parsed: ExcelFile[] = []
  const errors: string[] = []

  for (const file of files) {
    try {
      parsed.push(await parseWorkbook(file))
    } catch (error) {
      errors.push(`${file.name}: ${errorMessage(error)}`)
    }
  }

  return { files: parsed, errors }
}
