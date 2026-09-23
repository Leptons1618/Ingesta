/**
 * Table-operation check. Runs the real `lib/db` path against a throwaway SQLite
 * file: introspection, paging, ALTER (including SQLite's rebuild), row
 * mutations, snapshots, copies, and the query guardrails.
 *
 *   bun scripts/check-table-ops.ts
 *
 * PostgreSQL, MySQL and SQL Server have no server here, so their SQL is only
 * type-checked and asserted in `check-pipeline.ts`.
 */
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  alterTable,
  copyTable,
  createDatabase,
  createSnapshot,
  createTable,
  dropDatabase,
  dropSnapshot,
  dropTable,
  getTableStructure,
  getTables,
  insertData,
  listSnapshots,
  mutateRows,
  previewTable,
  restoreSnapshot,
  runQuery,
  truncateTable,
} from "@/lib/db"
import { dialectFor } from "@/lib/db/dialect"
import type { DatabaseConfig, TableCreationConfig } from "@/lib/types"

const directory = mkdtempSync(join(tmpdir(), "ingesta-table-ops-"))
const config: DatabaseConfig = {
  id: "check",
  name: "check",
  type: "sqlite",
  database: join(directory, "ops.db"),
}

const tableConfig: TableCreationConfig = {
  tableName: "orders",
  primaryKey: "id",
  columns: [
    { name: "id", suggestedType: "INT", nullable: false, samples: [1], uniqueValues: 3, nullCount: 0, totalCount: 3 },
    { name: "code", suggestedType: "VARCHAR(20)", nullable: false, samples: ["A"], uniqueValues: 3, nullCount: 0, totalCount: 3 },
    { name: "name", suggestedType: "VARCHAR(255)", nullable: true, samples: ["Ada"], uniqueValues: 3, nullCount: 0, totalCount: 3 },
    { name: "amount", suggestedType: "DECIMAL(10,2)", nullable: true, samples: [1], uniqueValues: 3, nullCount: 0, totalCount: 3 },
  ],
}

/** Turns a rejection into its message so an assertion can match on it. */
const failure = (run: Promise<unknown>) =>
  run.then(
    () => "resolved",
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  )

const columnNames = async (table: string) => (await getTableStructure(config, table)).map((column) => column.name)

try {
  await createTable(config, tableConfig)
  await insertData(config, "orders", ["id", "code", "name", "amount"], [
    [1, "A", "Ada", 10.5],
    [2, "B", "Grace", 20.25],
    [3, "C", "Alan", 30],
  ])

  // --- introspection reports names, nullability and the primary key
  const structure = await getTableStructure(config, "orders")
  assert.deepEqual(
    structure.map((column) => column.name),
    ["id", "code", "name", "amount"],
  )
  assert.equal(structure.find((column) => column.name === "id")?.isPrimaryKey, true)
  assert.equal(structure.find((column) => column.name === "id")?.nullable, false)
  assert.equal(structure.find((column) => column.name === "code")?.nullable, false)
  assert.equal(structure.find((column) => column.name === "name")?.nullable, true)

  // --- paging
  const firstPage = await previewTable(config, "orders", { limit: 2 })
  assert.equal(firstPage.data.length, 2)
  assert.equal(firstPage.totalRows, 3, "totalRows is the exact count, not the page size")
  assert.deepEqual(firstPage.columns, ["id", "code", "name", "amount"])

  const secondPage = await previewTable(config, "orders", { limit: 2, offset: 2 })
  assert.equal(secondPage.data.length, 1)
  assert.notDeepEqual(secondPage.data, firstPage.data, "an offset returns a different slice")

  const ordered = await previewTable(config, "orders", { limit: 3, orderBy: "amount", direction: "desc" })
  assert.deepEqual(ordered.data.map((row) => row[0]), [3, 2, 1], "orderBy and direction decide the slice")
  assert.deepEqual(
    (await previewTable(config, "orders", { limit: 3, orderBy: "amount" })).data.map((row) => row[0]),
    [1, 2, 3],
    "the default direction is ascending",
  )

  // The signature from before paging existed still works.
  const legacy = await previewTable(config, "orders", 1)
  assert.equal(legacy.data.length, 1)
  assert.equal(legacy.totalRows, 3)

  // --- ALTER: add, rename, rename table, drop
  await alterTable(config, "orders", {
    action: "add-column",
    column: { name: "note", type: "VARCHAR(50)", nullable: true },
  })
  assert.deepEqual(await columnNames("orders"), ["id", "code", "name", "amount", "note"], "add-column takes effect")

  await alterTable(config, "orders", { action: "rename-column", from: "note", to: "comment" })
  assert.deepEqual(await columnNames("orders"), ["id", "code", "name", "amount", "comment"], "rename-column takes effect")

  await alterTable(config, "orders", { action: "rename-table", to: "sales" })
  assert.deepEqual((await getTables(config)).map((table) => table.name), ["sales"], "rename-table takes effect")

  await alterTable(config, "sales", { action: "drop-column", column: "comment" })
  assert.deepEqual(await columnNames("sales"), ["id", "code", "name", "amount"], "drop-column takes effect")

  // --- change-type: SQLite rebuilds the table, and keeps every row
  await alterTable(config, "sales", { action: "change-type", column: "amount", type: "VARCHAR(20)", nullable: true })
  const rebuilt = await getTableStructure(config, "sales")
  assert.equal(rebuilt.find((column) => column.name === "amount")?.type, "VARCHAR(20)", "the column carries the new type")
  assert.equal(rebuilt.find((column) => column.name === "id")?.isPrimaryKey, true, "the rebuild keeps the primary key")

  const afterRebuild = await previewTable(config, "sales", { limit: 10 })
  assert.equal(afterRebuild.totalRows, 3, "the rebuild keeps every row")
  assert.equal(afterRebuild.data[0][2], "Ada", "a sampled value survives the rebuild")

  // --- row mutations
  const updated = await mutateRows(config, "sales", {
    action: "update",
    target: { primaryKey: "id", keys: [2] },
    records: [{ name: "Grace Hopper" }],
  })
  assert.equal(updated.affectedRows, 1)
  const edited = (await previewTable(config, "sales", { limit: 10 })).data.find((row) => row[0] === 2)
  assert.equal(edited?.[2], "Grace Hopper", "the update landed")

  assert.equal(
    (await mutateRows(config, "sales", { action: "delete", target: { primaryKey: "id", keys: [3] } })).affectedRows,
    1,
  )
  assert.equal((await previewTable(config, "sales", { limit: 10 })).totalRows, 2)

  const missed = await mutateRows(config, "sales", { action: "delete", target: { primaryKey: "id", keys: [999] } })
  assert.equal(missed.affectedRows, 0, "a key that matches nothing deletes nothing")
  assert.equal((await previewTable(config, "sales", { limit: 10 })).totalRows, 2, "the table is untouched")

  const inserted = await mutateRows(config, "sales", {
    action: "insert",
    records: [
      { id: 4, code: "D" },
      { id: 5, code: "E", name: "Edsger" },
    ],
  })
  assert.equal(inserted.affectedRows, 2)
  const afterInsert = await previewTable(config, "sales", { limit: 10 })
  assert.equal(afterInsert.totalRows, 4)
  assert.equal(afterInsert.data.find((row) => row[0] === 4)?.[2], null, "a record that omits a column binds NULL")

  // --- snapshots
  const beforeSnapshot = await previewTable(config, "sales", { limit: 10 })
  const snapshot = await createSnapshot(config, "sales")
  assert.equal(snapshot.table, "sales")
  assert.equal(snapshot.rowCount, 4)
  assert.ok(snapshot.name.startsWith("_ingesta_snap_"), "a snapshot is stored under the reserved prefix")

  assert.equal((await truncateTable(config, "sales")).deletedRows, 4)
  assert.equal((await previewTable(config, "sales", { limit: 10 })).totalRows, 0, "truncate empties the table")

  assert.equal((await restoreSnapshot(config, snapshot.name)).restoredRows, 4)
  const afterRestore = await previewTable(config, "sales", { limit: 10 })
  assert.equal(afterRestore.totalRows, 4)
  assert.deepEqual(afterRestore.data, beforeSnapshot.data, "the rows come back exactly as they were")

  const snapshots = await listSnapshots(config)
  assert.deepEqual(snapshots.map((entry) => entry.name), [snapshot.name])
  assert.equal(snapshots[0].table, "sales")
  assert.equal(snapshots[0].rowCount, 4)
  assert.ok(snapshot.name.length <= 63, "a generated name fits the engine's identifier limit")

  // A name the caller supplies is sanitised and trimmed to the same limit.
  const named = await createSnapshot(config, "sales", "A very long snapshot name ".repeat(8))
  assert.ok(named.name.startsWith("_ingesta_snap_"), "a named snapshot keeps the reserved prefix")
  assert.ok(named.name.length <= 63, "a supplied name is trimmed to the engine's identifier limit")
  await dropSnapshot(config, named.name)

  assert.ok(
    !(await getTables(config)).some((table) => table.name.startsWith("_ingesta_")),
    "snapshots and scratch tables never appear in the explorer",
  )

  await dropSnapshot(config, snapshot.name)
  assert.deepEqual(await listSnapshots(config), [], "the registry forgets a dropped snapshot")
  assert.ok(
    !(await getTables(config)).some((table) => table.name === snapshot.name),
    "dropping removes the storage table too",
  )

  const unknownSnapshot = await failure(restoreSnapshot(config, "_ingesta_snap_missing"))
  assert.match(unknownSnapshot, /not in the snapshot registry/i)

  // --- copies
  assert.equal((await copyTable(config, "sales", "sales_copy", "create")).copiedRows, 4)
  assert.equal((await previewTable(config, "sales_copy", { limit: 10 })).totalRows, 4)
  assert.match(String(await failure(copyTable(config, "sales", "sales_copy", "create"))), /already exists/i)

  await mutateRows(config, "sales_copy", { action: "insert", records: [{ id: 9, code: "Z" }] })
  assert.equal((await copyTable(config, "sales", "sales_copy", "append")).copiedRows, 4)
  assert.equal((await previewTable(config, "sales_copy", { limit: 10 })).totalRows, 9, "append adds to what is there")

  assert.equal((await copyTable(config, "sales", "sales_copy", "replace")).copiedRows, 4)
  assert.equal((await previewTable(config, "sales_copy", { limit: 10 })).totalRows, 4, "replace starts from empty")

  // Columns travel by name, so a target with none in common is refused.
  await createTable(config, {
    tableName: "other",
    primaryKey: "ref",
    columns: [
      { name: "ref", suggestedType: "INT", nullable: false, samples: [1], uniqueValues: 1, nullCount: 0, totalCount: 1 },
    ],
  })
  assert.match(
    String(await failure(copyTable(config, "sales", "other", "append"))),
    /share no column names/i,
  )

  // --- query guardrails
  const selected = await runQuery(config, "SELECT code FROM sales ORDER BY code")
  assert.deepEqual(selected.columns, ["code"])
  assert.equal(selected.data.length, 4)
  assert.equal(selected.truncated, false)
  assert.ok(selected.durationMs >= 0, "the query is timed")

  assert.match(String(await failure(runQuery(config, "SELECT 1; DROP TABLE sales"))), /one statement/i)

  const refusedWrite = await failure(runQuery(config, "DROP TABLE sales"))
  assert.match(refusedWrite, /write access/i)
  assert.equal((await previewTable(config, "sales", { limit: 10 })).totalRows, 4, "the refused statement never ran")

  await runQuery(config, "CREATE TABLE scratch (id INTEGER)", { allowWrite: true })
  assert.ok((await getTables(config)).some((table) => table.name === "scratch"), "a write runs when it is allowed")
  await runQuery(config, "DROP TABLE scratch", { allowWrite: true })
  assert.ok(!(await getTables(config)).some((table) => table.name === "scratch"))

  await insertData(config, "sales", ["id", "code"], [
    [10, "X"],
    [11, "X"],
    [12, "X"],
    [13, "X"],
  ])
  const capped = await runQuery(config, "SELECT * FROM sales", { maxRows: 2 })
  assert.equal(capped.data.length, 2)
  assert.equal(capped.truncated, true, "more rows exist than the cap allows")

  const exact = await runQuery(config, "SELECT * FROM sales", { maxRows: 8 })
  assert.equal(exact.data.length, 8)
  assert.equal(exact.truncated, false, "a result set that fits the cap is not truncated")

  assert.match(String(await failure(runQuery(config, "SELECT 1", { maxRows: 5001 }))), /5000/)

  // --- truncate keeps the table, drop removes it
  assert.equal((await truncateTable(config, "sales_copy")).deletedRows, 4)
  assert.equal((await previewTable(config, "sales_copy", { limit: 10 })).totalRows, 0)
  assert.ok((await getTables(config)).some((table) => table.name === "sales_copy"), "truncate keeps the table")

  await dropTable(config, "sales_copy")
  assert.ok(!(await getTables(config)).some((table) => table.name === "sales_copy"), "drop removes it")

  // --- operations the SQLite file cannot stand in for
  assert.match(String(await failure(createDatabase(config, "another"))), /stores each database as a file/i)
  assert.match(String(await failure(dropDatabase(config, "another"))), /stores each database as a file/i)

  // --- PostgreSQL, MySQL and SQL Server have no server here, so their SQL is
  //     asserted directly instead of being run.
  const postgres = dialectFor("postgresql")
  assert.equal(postgres.identifierLimit, 63)
  assert.equal(postgres.createTableAsSql("t2", "t1"), 'CREATE TABLE "t2" AS SELECT * FROM "t1"')
  assert.equal(postgres.insertFromSelectSql("t2", ["a", "b"], "t1"), 'INSERT INTO "t2" ("a", "b") SELECT "a", "b" FROM "t1"')
  assert.equal(
    postgres.pageSql("t1", { limit: 10, offset: 20, orderBy: "a", direction: "desc" }),
    'SELECT * FROM "t1" ORDER BY "a" DESC LIMIT 10 OFFSET 20',
  )
  assert.equal(postgres.pageSql("t1", { limit: 5, offset: 0, direction: "asc" }), 'SELECT * FROM "t1" LIMIT 5 OFFSET 0')
  assert.equal(postgres.limitSql("SELECT 1", 501), 'SELECT * FROM (SELECT 1) AS "_ingesta_query" LIMIT 501')
  assert.equal(
    postgres.addColumnSql("t1", { name: "a", type: "VARCHAR(10)", nullable: false }),
    'ALTER TABLE "t1" ADD COLUMN "a" VARCHAR(10) NOT NULL',
  )
  assert.equal(postgres.dropColumnSql("t1", "a"), 'ALTER TABLE "t1" DROP COLUMN "a"')
  assert.equal(postgres.renameColumnSql("t1", "a", "b"), 'ALTER TABLE "t1" RENAME COLUMN "a" TO "b"')
  assert.equal(postgres.renameTableSql("t1", "t2"), 'ALTER TABLE "t1" RENAME TO "t2"')
  assert.deepEqual(postgres.changeTypeSql("t1", "a", "INT", false), [
    'ALTER TABLE "t1" ALTER COLUMN "a" TYPE INTEGER USING "a"::INTEGER',
    'ALTER TABLE "t1" ALTER COLUMN "a" SET NOT NULL',
  ])
  assert.ok(postgres.registrySql().startsWith('CREATE TABLE "_ingesta_snapshots" ('), "the registry is created on demand")

  const mysql = dialectFor("mysql")
  assert.equal(mysql.identifierLimit, 64)
  assert.equal(mysql.pageSql("t1", { limit: 10, offset: 20, direction: "asc" }), "SELECT * FROM `t1` LIMIT 10 OFFSET 20")
  assert.equal(mysql.addColumnSql("t1", { name: "a", type: "INT", nullable: true }), "ALTER TABLE `t1` ADD COLUMN `a` INT")
  assert.deepEqual(mysql.changeTypeSql("t1", "a", "VARCHAR(5)", true), [
    "ALTER TABLE `t1` MODIFY COLUMN `a` VARCHAR(5) NULL",
  ])

  const mssql = dialectFor("mssql")
  assert.equal(mssql.identifierLimit, 128)
  assert.equal(mssql.createTableAsSql("t2", "t1"), "SELECT * INTO [t2] FROM [t1]", "T-SQL has no CREATE TABLE … AS SELECT")
  assert.equal(
    mssql.addColumnSql("t1", { name: "a", type: "VARCHAR(10)", nullable: false }),
    "ALTER TABLE [t1] ADD [a] NVARCHAR(10) NOT NULL",
    "T-SQL adds a column without the COLUMN keyword",
  )
  assert.equal(
    mssql.pageSql("t1", { limit: 10, offset: 20, orderBy: "a", direction: "desc" }),
    "SELECT * FROM [t1] ORDER BY [a] DESC OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY",
  )
  assert.equal(
    mssql.pageSql("t1", { limit: 10, offset: 0, direction: "asc" }),
    "SELECT * FROM [t1] ORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY",
    "OFFSET needs an ORDER BY, so a stable one is supplied",
  )
  assert.equal(mssql.limitSql("SELECT 1", 501), "SELECT TOP (501) * FROM (SELECT 1) AS [_ingesta_query]")
  assert.deepEqual(mssql.changeTypeSql("t1", "a", "INT", false), ["ALTER TABLE [t1] ALTER COLUMN [a] INT NOT NULL"])
  assert.equal(mssql.renameTableSql("t1", "t2"), "EXEC sp_rename 't1', 't2'")
  assert.equal(mssql.renameColumnSql("t1", "a", "b"), "EXEC sp_rename 't1.a', 'b', 'COLUMN'")

  // SQLite has no ALTER COLUMN, which is what sends the caller down the rebuild path.
  assert.equal(dialectFor("sqlite").changeTypeSql("t1", "a", "INT", true), null)

  console.log("check-table-ops: all assertions passed")
} finally {
  rmSync(directory, { recursive: true, force: true })
}
