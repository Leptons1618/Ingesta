import { roundToSecond } from "@/lib/transform"
import type { ColumnAnalysis, DatabaseType, ExcelSheet, TableCreationConfig } from "@/lib/types"

const isBlank = (value: unknown) => value === null || value === undefined || value === ""

const BOOLEAN_WORDS: Record<string, true> = {
  true: true,
  false: true,
  yes: true,
  no: true,
  1: true,
  0: true,
  y: true,
  n: true,
}

/** Text date shapes we accept; the numeric fallback is handled separately. */
const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
  /^\d{4}\/\d{2}\/\d{2}$/, // YYYY/MM/DD
  /^\d{1,2}\/\d{1,2}\/\d{4}$/, // M/D/YYYY
  /^\d{1,2}-\d{1,2}-\d{4}$/, // M-D-YYYY
  /^\d{1,2}\.\d{1,2}\.\d{4}$/, // D.M.YYYY
  /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/, // Month DD, YYYY
  /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/, // DD Month YYYY
]

const inDateRange = (value: Date) => value.getUTCFullYear() >= 1900 && value.getUTCFullYear() <= 2100

const isNumeric = (value: unknown) =>
  typeof value !== "boolean" && !(value instanceof Date) && String(value).trim() !== "" && Number.isFinite(Number(value))

/**
 * Dates arrive as real Date objects (`cellDates` in the parser) or as text.
 * A bare number is never treated as a date: Excel serials for 1900–2100 span
 * 1–73415, which is also the range of ordinary quantities, prices, and weights,
 * so guessing there turned decimal and integer columns into DATE columns.
 */
const isDateTime = (value: unknown) => {
  if (value instanceof Date) {
    // UTC and rounded to the second, matching formatDateForDatabase: a UTC-midnight
    // instant stays a plain date even when it arrives a millisecond short of midnight.
    if (isNaN(value.getTime())) return false
    const instant = roundToSecond(value)
    return instant.getUTCHours() !== 0 || instant.getUTCMinutes() !== 0 || instant.getUTCSeconds() !== 0
  }
  const text = String(value)
  return /\d{1,2}:\d{2}/.test(text) && !isNaN(Date.parse(text))
}

const isDate = (value: unknown) => {
  if (value instanceof Date) return !isNaN(value.getTime())
  const text = String(value).trim()
  if (!DATE_PATTERNS.some((pattern) => pattern.test(text))) return false
  const parsed = new Date(text)
  return !isNaN(parsed.getTime()) && inDateRange(parsed)
}

const isBoolean = (value: unknown) => typeof value === "boolean" || BOOLEAN_WORDS[String(value).toLowerCase()] === true

const isInteger = (value: unknown) => isNumeric(value) && Number.isInteger(Number(value))

const isEmail = (value: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))

const isUrl = (value: unknown) => /^https?:\/\/\S+/.test(String(value))

const isJson = (value: unknown) => {
  if (value instanceof Date) return false
  try {
    JSON.parse(String(value))
    return true
  } catch {
    return false
  }
}

/** Maps a longest-value length onto the narrowest column type that fits it. */
function textType(maxLength: number): string {
  if (maxLength <= 10) return "VARCHAR(20)"
  if (maxLength <= 50) return "VARCHAR(100)"
  if (maxLength <= 255) return "VARCHAR(255)"
  if (maxLength <= 1000) return "VARCHAR(1000)"
  return "TEXT"
}

function detectType(values: unknown[]): { suggestedType: string; maxLength?: number } {
  const ratio = (predicate: (value: unknown) => boolean) => values.filter(predicate).length / values.length

  if (ratio(isBoolean) > 0.8) return { suggestedType: "BOOLEAN" }
  if (ratio(isDateTime) > 0.8) return { suggestedType: "DATETIME" }
  if (ratio(isDate) > 0.8) return { suggestedType: "DATE" }

  const numeric = ratio(isNumeric)
  if (numeric > 0.9) {
    if (ratio(isInteger) >= numeric) {
      const largest = Math.max(...values.map((value) => Math.abs(Number(value))))
      if (largest <= 127) return { suggestedType: "TINYINT" }
      if (largest <= 32767) return { suggestedType: "SMALLINT" }
      if (largest <= 2147483647) return { suggestedType: "INT" }
      return { suggestedType: "BIGINT" }
    }
    return { suggestedType: "DECIMAL(10,2)" }
  }

  if (ratio(isEmail) > 0.8) return { suggestedType: "VARCHAR(255)" }
  if (ratio(isUrl) > 0.8) return { suggestedType: "VARCHAR(500)" }
  if (ratio(isJson) > 0.8) return { suggestedType: "JSON" }

  const maxLength = Math.max(...values.map((value) => String(value).length))
  return { suggestedType: textType(maxLength), maxLength }
}

export function analyzeColumn(name: string, values: unknown[]): ColumnAnalysis {
  const present = values.filter((value) => !isBlank(value))
  const nullCount = values.length - present.length

  if (present.length === 0) {
    return {
      name,
      suggestedType: "VARCHAR(255)",
      nullable: true,
      samples: [],
      uniqueValues: 0,
      nullCount,
      totalCount: values.length,
    }
  }

  // Deduplicate on the text form but keep the original value, so a sample still
  // knows it is a Date, a number or a boolean. Stringifying here is what used to
  // make the schema editor show `Mon Jan 15 2024 05:30:00 GMT+0530` beside a
  // column it had correctly typed as DATE.
  const seen = new Set<string>()
  const distinct: unknown[] = []
  for (const value of present) {
    const key = String(value)
    if (seen.has(key)) continue
    seen.add(key)
    distinct.push(value)
  }

  const { suggestedType, maxLength } = detectType(present)

  return {
    name,
    suggestedType,
    nullable: nullCount > 0,
    maxLength,
    samples: distinct.slice(0, 5),
    uniqueValues: distinct.length,
    nullCount,
    totalCount: values.length,
  }
}

export function analyzeSheet(sheet: ExcelSheet): TableCreationConfig {
  if (sheet.data.length === 0) {
    return { tableName: sanitizeTableName(sheet.name), columns: [] }
  }

  const names = uniqueNames(sheet.headers.map((header) => sanitizeColumnName(String(header))))
  const columns = names.map((name, index) => analyzeColumn(name, sheet.data.map((row) => row[index])))

  const naturalKey = columns.find((column) => column.nullCount === 0 && column.uniqueValues === column.totalCount)

  return {
    tableName: sanitizeTableName(sheet.name),
    columns,
    primaryKey: naturalKey?.name ?? "id",
  }
}

/** Two columns may share a header label; a table cannot have two columns with one name. */
function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const count = (seen.get(name) ?? 0) + 1
    seen.set(name, count)
    return count === 1 ? name : `${name}_${count}`
  })
}

function sanitizeIdentifier(name: string, prefix: string, fallback: string): string {
  const cleaned = String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^[0-9]/, `${prefix}_$&`)
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 63)

  return cleaned || fallback
}

export const sanitizeTableName = (name: string) => sanitizeIdentifier(name, "table", "table_1")

export const sanitizeColumnName = (name: string) => sanitizeIdentifier(name, "col", "unnamed_column")

/** Only the entries that differ per engine; everything else passes through. */
const TYPE_OVERRIDES: Record<DatabaseType, Record<string, string>> = {
  mysql: {},
  postgresql: { TINYINT: "SMALLINT", INT: "INTEGER", DATETIME: "TIMESTAMP", JSON: "JSONB" },
  sqlite: {
    BOOLEAN: "INTEGER",
    TINYINT: "INTEGER",
    SMALLINT: "INTEGER",
    INT: "INTEGER",
    BIGINT: "INTEGER",
    "DECIMAL(10,2)": "REAL",
    DATE: "TEXT",
    DATETIME: "TEXT",
    JSON: "TEXT",
  },
  mssql: {
    BOOLEAN: "BIT",
    DATETIME: "DATETIME2",
    JSON: "NVARCHAR(MAX)",
    TEXT: "NVARCHAR(MAX)",
  },
}

/**
 * The semantic types an editor may offer. These are the strings `detectType`
 * produces plus a few the user may reasonably want, and every one of them has
 * an engine mapping (or passes through unchanged). Editors show these; the
 * engine-specific name is applied later by `adaptTypeForDatabase`.
 */
export const COLUMN_TYPE_OPTIONS: Array<{ value: string; label: string; group: string }> = [
  { value: "BOOLEAN", label: "Boolean", group: "Logic" },
  { value: "TINYINT", label: "Tiny integer", group: "Number" },
  { value: "SMALLINT", label: "Small integer", group: "Number" },
  { value: "INT", label: "Integer", group: "Number" },
  { value: "BIGINT", label: "Big integer", group: "Number" },
  { value: "DECIMAL(10,2)", label: "Decimal (10,2)", group: "Number" },
  { value: "FLOAT", label: "Float", group: "Number" },
  { value: "VARCHAR(50)", label: "Text (50)", group: "Text" },
  { value: "VARCHAR(100)", label: "Text (100)", group: "Text" },
  { value: "VARCHAR(255)", label: "Text (255)", group: "Text" },
  { value: "VARCHAR(500)", label: "Text (500)", group: "Text" },
  { value: "TEXT", label: "Long text", group: "Text" },
  { value: "JSON", label: "JSON", group: "Text" },
  { value: "DATE", label: "Date", group: "Date and time" },
  { value: "DATETIME", label: "Date and time", group: "Date and time" },
]

export function adaptTypeForDatabase(dataType: string, databaseType: DatabaseType): string {
  const type = dataType.toUpperCase()

  if (databaseType === "mssql" && type.startsWith("VARCHAR")) {
    return dataType.replace(/VARCHAR/i, "NVARCHAR")
  }

  return TYPE_OVERRIDES[databaseType][type] ?? dataType
}
