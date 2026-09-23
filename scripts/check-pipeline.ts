/**
 * Pipeline self-check. Runs the real modules — parser, type detection, value
 * transformation, and DDL generation — against a workbook built in memory.
 *
 *   bun scripts/check-pipeline.ts
 *
 * Fails loudly if a change breaks any of the invariants documented in
 * docs/ARCHITECTURE.md.
 */
import assert from "node:assert/strict"
import * as XLSX from "xlsx"

import { createTableSql, dialectFor } from "@/lib/db/dialect"
import { parseWorkbooks } from "@/lib/excel"
import { adaptTypeForDatabase, analyzeSheet, sanitizeTableName } from "@/lib/schema"
import { formatDateForDatabase, transformDataRows } from "@/lib/transform"
import type { DatabaseType, ExcelSheet } from "@/lib/types"

const LONG_NOTE = "n".repeat(1200)

const grid: unknown[][] = [
  ["id", "name", "email", "amount", "quantity", "joined", "active", "notes", "name"],
  [1, "Ada", "ada@example.com", 12.5, 5, new Date(Date.UTC(2024, 0, 15)), "yes", LONG_NOTE, "dup-a"],
  [2, "Grace", "grace@example.com", 7.25, 12, new Date(Date.UTC(2024, 5, 1)), "no", "short", "dup-b"],
]

const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(grid), "Orders")
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["empty"]]), "Blank")
const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx", cellDates: true }) as ArrayBuffer

const parsed = await parseWorkbooks([new File([bytes], "sample.xlsx")])
assert.deepEqual(parsed.errors, [], "workbook should parse without errors")

const sheet = parsed.files[0]?.sheets.find((entry) => entry.name === "Orders") as ExcelSheet
assert.ok(sheet, "Orders sheet should be present")
assert.equal(parsed.files[0].sheets.length, 1, "a header-only sheet is dropped")

// Headers are padded/labelled, and the header row is not part of the data.
assert.deepEqual(sheet.headers, ["id", "name", "email", "amount", "quantity", "joined", "active", "notes", "name"])
assert.equal(sheet.data.length, 2, "data excludes the header row")
assert.equal(sheet.data[0].length, sheet.headers.length, "rows are padded to the header width")

const config = analyzeSheet(sheet)
const typeOf = (name: string) => config.columns.find((column) => column.name === name)?.suggestedType

// Duplicate header labels get suffixed instead of colliding.
assert.deepEqual(
  config.columns.map((column) => column.name),
  ["id", "name", "email", "amount", "quantity", "joined", "active", "notes", "name_2"],
)
assert.equal(config.tableName, "orders")
assert.equal(sanitizeTableName("2024 Sales!"), "table_2024_sales")

// Regression guard: a small integer column must never be guessed into a DATE.
assert.equal(typeOf("id"), "TINYINT")
assert.equal(typeOf("quantity"), "TINYINT")
assert.equal(typeOf("amount"), "DECIMAL(10,2)")
assert.equal(typeOf("joined"), "DATE")
assert.equal(typeOf("email"), "VARCHAR(255)")
assert.equal(typeOf("notes"), "TEXT")
assert.equal(typeOf("active"), "BOOLEAN")

// Primary key: `id` is unique and complete, so it wins over the auto-id fallback.
assert.equal(config.primaryKey, "id")
assert.equal(analyzeSheet({ name: "x", headers: ["a"], data: [[1], [1]] }).primaryKey, "id")

// Values are coerced to what the detected column type expects.
const transformed = transformDataRows(sheet.data, config.columns)
assert.equal(transformed[0][0], 1)
assert.equal(transformed[0][3], 12.5)
assert.equal(transformed[0][5], "2024-01-15", "dates are formatted as YYYY-MM-DD")
assert.equal(transformed[0][6], true)
assert.equal(transformed[1][6], false)
assert.equal(transformDataRows([[null]], [{ ...config.columns[0] }])[0][0], null, "blanks stay NULL")

// Excel day fractions carry sub-second drift; a written 17:45:00 must not become 17:44:59.
assert.equal(
  formatDateForDatabase(new Date("2024-01-03T17:44:59.999Z"), "DATETIME"),
  "2024-01-03 17:45:00",
  "sub-second drift rounds to the nearest second",
)
assert.equal(
  formatDateForDatabase(new Date("2024-01-03T23:59:59.999Z"), "DATE"),
  "2024-01-04",
  "rounding can carry into the next day",
)
assert.equal(formatDateForDatabase(new Date("2023-03-04T00:00:00.000Z"), "DATE"), "2023-03-04")

// A datetime column is detected as such, a drifted midnight is not.
assert.equal(
  typeOf("joined"),
  "DATE",
  "a UTC-midnight date is a date, not a timestamp",
)

// Dialect differences: quoting, placeholders, auto-id column, type adaptation.
const expectations: Record<
  DatabaseType,
  { table: string; idColumn: string; tinyint: string; integer: string }
> = {
  postgresql: { table: '"orders"', idColumn: "id SERIAL PRIMARY KEY", tinyint: "SMALLINT", integer: "INTEGER" },
  mysql: { table: "`orders`", idColumn: "id INT AUTO_INCREMENT PRIMARY KEY", tinyint: "TINYINT", integer: "INT" },
  sqlite: { table: '"orders"', idColumn: "id INTEGER PRIMARY KEY AUTOINCREMENT", tinyint: "INTEGER", integer: "INTEGER" },
  mssql: { table: "[orders]", idColumn: "id INT IDENTITY(1,1) PRIMARY KEY", tinyint: "TINYINT", integer: "INT" },
}

for (const [type, expected] of Object.entries(expectations) as Array<[DatabaseType, (typeof expectations)[DatabaseType]]>) {
  const dialect = dialectFor(type)
  const ddl = createTableSql(dialect, "orders", config)
  assert.ok(ddl.startsWith(`CREATE TABLE ${expected.table} (`), `${type}: table name quoting`)
  assert.ok(ddl.includes(`PRIMARY KEY (${dialect.quote("id")})`), `${type}: named primary key`)
  assert.ok(!ddl.includes(expected.idColumn), `${type}: a named primary key replaces the auto-id column`)
  assert.equal(adaptTypeForDatabase("TINYINT", type), expected.tinyint, `${type}: TINYINT mapping`)
  assert.equal(adaptTypeForDatabase("INT", type), expected.integer, `${type}: INT mapping`)
  assert.equal(dialect.placeholder(0), type === "postgresql" ? "$1" : type === "mssql" ? "@p0" : "?", `${type}: placeholder`)

  // Without a nominated key, the table gets a generated identity column instead.
  const fallback = createTableSql(dialect, "orders", { tableName: "orders", columns: config.columns })
  assert.ok(fallback.includes(expected.idColumn), `${type}: auto-id fallback`)
  assert.ok(!fallback.includes("PRIMARY KEY ("), `${type}: no separate key clause in the fallback`)
}

// A non-nullable column is spelled out, and mssql swaps VARCHAR for NVARCHAR.
const required = createTableSql(dialectFor("mssql"), "orders", {
  tableName: "orders",
  primaryKey: "id",
  columns: [{ ...config.columns[0], nullable: false }],
})
assert.ok(required.includes("[id] TINYINT NOT NULL"), "nullable columns emit NOT NULL")
assert.equal(adaptTypeForDatabase("VARCHAR(255)", "mssql"), "NVARCHAR(255)")
assert.equal(adaptTypeForDatabase("JSON", "postgresql"), "JSONB")
assert.equal(adaptTypeForDatabase("DATETIME", "sqlite"), "TEXT")

console.log("check-pipeline: all assertions passed")
