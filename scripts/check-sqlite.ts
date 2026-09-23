/**
 * End-to-end database check against a throwaway SQLite file. Exercises the real
 * `lib/db` path: create table, insert rows containing NULLs, preview, introspect.
 *
 *   bun scripts/check-sqlite.ts
 */
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { createTable, getTables, insertData, previewTable, testConnection } from "@/lib/db"
import type { DatabaseConfig, TableCreationConfig } from "@/lib/types"

const directory = mkdtempSync(join(tmpdir(), "ingesta-check-"))
const config: DatabaseConfig = {
  id: "check",
  name: "check",
  type: "sqlite",
  database: join(directory, "check.db"),
}

const tableConfig: TableCreationConfig = {
  tableName: "orders",
  primaryKey: "id",
  columns: [
    { name: "id", suggestedType: "INT", nullable: false, samples: [1], uniqueValues: 2, nullCount: 0, totalCount: 2 },
    { name: "code", suggestedType: "VARCHAR(20)", nullable: false, samples: ["A"], uniqueValues: 2, nullCount: 0, totalCount: 2 },
    { name: "name", suggestedType: "VARCHAR(255)", nullable: true, samples: ["Ada"], uniqueValues: 2, nullCount: 1, totalCount: 2 },
    { name: "amount", suggestedType: "DECIMAL(10,2)", nullable: true, samples: [12.5], uniqueValues: 2, nullCount: 1, totalCount: 2 },
    { name: "joined", suggestedType: "DATE", nullable: true, samples: ["2024-01-15"], uniqueValues: 2, nullCount: 0, totalCount: 2 },
    { name: "active", suggestedType: "BOOLEAN", nullable: false, samples: ["yes"], uniqueValues: 2, nullCount: 0, totalCount: 2 },
  ],
}

try {
  const connection = await testConnection(config)
  assert.equal(connection.success, true, `connection should succeed: ${connection.message}`)
  assert.equal(connection.details?.tablesCount, 0, "a fresh file has no tables")

  await createTable(config, tableConfig)

  const columns = ["id", "code", "name", "amount", "joined", "active"]

  // NULLs are passed through untouched, and an all-blank row is skipped.
  const inserted = await insertData(config, "orders", columns, [
    [1, "A", "Ada", 12.5, "2024-01-15", true],
    [2, "B", null, null, "2024-06-01", false],
    [null, null, null, null, null, null],
  ])
  assert.equal(inserted.insertedRows, 2, "the blank row is skipped, the NULL row is kept")

  const preview = await previewTable(config, "orders", 10)
  assert.deepEqual(preview.columns, columns)
  assert.equal(preview.totalRows, 2)
  assert.equal(preview.data.length, 2)
  assert.equal(preview.data[1][2], null, "NULL survives the round trip instead of becoming an empty string")
  assert.equal(preview.data[1][3], null)
  assert.equal(preview.data[0][3], 12.5, "numbers keep their value")
  assert.equal(preview.data[0][5], 1, "booleans are stored as the engine's own representation")
  assert.equal(preview.data[1][5], 0)

  const tables = await getTables(config)
  assert.equal(tables.length, 1)
  assert.equal(tables[0].name, "orders")
  assert.equal(tables[0].rowCount, 2)
  assert.equal(tables[0].columns.find((column) => column.name === "id")?.isPrimaryKey, true)
  assert.equal(tables[0].columns.find((column) => column.name === "name")?.nullable, true)
  assert.equal(tables[0].columns.find((column) => column.name === "code")?.nullable, false)

  // A NOT NULL violation rolls the whole batch back: no partial import.
  const strict = await insertData(config, "orders", columns, [
    [3, "C", "Grace", 1, "2024-01-01", true],
    [4, null, "Broken", 2, "2024-01-01", true],
  ]).then(
    () => "resolved",
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  )
  assert.ok(strict !== "resolved", "inserting NULL into a NOT NULL column must fail")
  assert.equal((await previewTable(config, "orders", 10)).totalRows, 2, "the failed batch left no rows behind")

  // Re-creating an existing table surfaces a real error rather than silence.
  const duplicate = await createTable(config, tableConfig).then(
    () => "resolved",
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  )
  assert.match(String(duplicate), /already exists/i, "creating a duplicate table reports the engine's error")

  console.log("check-sqlite: all assertions passed")
} finally {
  rmSync(directory, { recursive: true, force: true })
}
