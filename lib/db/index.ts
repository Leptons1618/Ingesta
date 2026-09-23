import { analyseSql } from "@/lib/guardrails"
import { isBlankCell } from "@/lib/import-execution"
import { sanitizeTableName } from "@/lib/schema"
import { errorMessage } from "@/lib/utils"
import type {
  AlterAction,
  ConnectionTestResult,
  DatabaseColumn,
  DatabaseConfig,
  DatabaseTable,
  GridColumn,
  InsertBatchOutcome,
  QueryResult,
  RowMutation,
  ServerOptions,
  SortDirection,
  TableCreationConfig,
  TableSnapshot,
} from "@/lib/types"

import {
  INGESTA_PREFIX,
  REBUILD_TABLE,
  SNAPSHOT_PREFIX,
  SNAPSHOT_REGISTRY,
  createTableFromColumnsSql,
  createTableSql,
  dialectFor,
  toBoolean,
  withSession,
  type Dialect,
  type QueryFn,
  type Session,
} from "./dialect"

export type { Session } from "./dialect"

/** Paging and ordering for `previewTable`; a bare number means `{ limit }`. */
export interface PreviewOptions {
  limit?: number
  offset?: number
  orderBy?: string
  direction?: SortDirection
}

/** Keys per statement; every engine takes 500 bound parameters without complaint. */
const MAX_KEYS_PER_STATEMENT = 500

const DEFAULT_MAX_ROWS = 500
const MAX_MAX_ROWS = 5000

/** Verbs whose result set can be wrapped in a subquery to cap the row count. */
const WRAPPABLE_VERBS: Record<string, true> = { select: true, with: true, values: true }

/** Rejects configurations that cannot possibly work, before a driver is opened. */
function assertConnection(config: ServerOptions | DatabaseConfig, { requireDatabase = true } = {}): void {
  dialectFor(config.type)
  if (config.type === "sqlite") {
    if (requireDatabase && !config.database?.trim()) throw new Error("SQLite needs a database file path")
    return
  }
  if (!config.host?.trim()) throw new Error("Host is required for this database type")
  if (!config.username?.trim()) throw new Error("Username is required for this database type")
  if (requireDatabase && !config.database?.trim()) throw new Error("Database name is required")
}

/** Server-level operations connect to an admin database unless the user named one. */
function serverOptions(options: ServerOptions, dialect: Dialect): ServerOptions {
  return { ...options, database: options.database?.trim() || dialect.adminDatabase }
}

/** Introspection rows carry the same keys on every engine (see each `columnsSql`). */
function mapColumns(rows: Array<Record<string, unknown>>): DatabaseColumn[] {
  return rows.map((column) => ({
    name: String(column.name),
    type: String(column.type ?? "").toUpperCase(),
    nullable: toBoolean(column.nullable),
    isPrimaryKey: toBoolean(column.pk),
    defaultValue: column.default == null ? undefined : String(column.default),
  }))
}

async function columnNames(query: QueryFn, dialect: Dialect, table: string): Promise<string[]> {
  const rows = await query<Record<string, unknown>>(dialect.columnsSql(table))
  return rows.map((row) => String(row.name))
}

async function listTables(session: Session, dialect: Dialect): Promise<DatabaseTable[]> {
  const tables = await session.query<{ name: string }>(dialect.tablesSql)
  // Tables the app creates for itself — snapshots, the rebuild scratch table —
  // are not the user's data, so they never reach the explorer.
  const visible = tables.filter(({ name }) => !name.startsWith(INGESTA_PREFIX))

  return Promise.all(
    visible.map(async ({ name }) => {
      const columns = await session.query<Record<string, unknown>>(dialect.columnsSql(name))
      let rowCount: number | undefined
      try {
        // ponytail: COUNT(*) per table; switch to a stats-table read if schemas get large.
        rowCount = Number((await session.query<{ cnt: unknown }>(dialect.countSql(name)))[0]?.cnt)
      } catch {
        // Counting can be denied by permissions; a missing count is not an error.
      }

      return { name, rowCount, columns: mapColumns(columns) }
    }),
  )
}

export async function testConnection(config: DatabaseConfig): Promise<ConnectionTestResult> {
  try {
    assertConnection(config)
  } catch (error) {
    return { success: false, message: errorMessage(error) }
  }

  try {
    const dialect = dialectFor(config.type)
    return await withSession(config, async (session) => {
      const version = await session.query<{ version: string }>(dialect.versionSql)
      const tables = await listTables(session, dialect)

      return {
        success: true,
        message: "Connection successful",
        details: {
          serverVersion: dialect.serverVersion(String(version[0]?.version ?? "")),
          databaseName: config.database,
          tablesCount: tables.length,
        },
      }
    })
  } catch (error) {
    return { success: false, message: errorMessage(error) }
  }
}

export async function listDatabases(options: ServerOptions): Promise<string[]> {
  assertConnection(options, { requireDatabase: false })
  const dialect = dialectFor(options.type)
  if (!dialect.databasesSql) return []

  return withSession(serverOptions(options, dialect), async (session) => {
    const rows = await session.query<{ name: string }>(dialect.databasesSql!)
    return rows.map((row) => String(row.name))
  })
}

export async function createDatabase(options: ServerOptions, databaseName: string): Promise<void> {
  assertConnection(options, { requireDatabase: false })

  const name = databaseName.trim()
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error("Database names may only contain letters, numbers, and underscores")
  }

  const dialect = dialectFor(options.type)
  if (options.type === "sqlite") {
    throw new Error("SQLite stores each database as a file; choose a new file path instead")
  }

  await withSession(serverOptions(options, dialect), (session) =>
    session.query(`CREATE DATABASE ${dialect.quote(name)}`),
  )
}

export async function dropDatabase(options: ServerOptions, databaseName: string): Promise<void> {
  assertConnection(options, { requireDatabase: false })

  const name = databaseName.trim()
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error("Database names may only contain letters, numbers, and underscores")
  }

  const dialect = dialectFor(options.type)
  if (options.type === "sqlite") {
    throw new Error("SQLite stores each database as a file; delete the file instead")
  }

  await withSession(serverOptions(options, dialect), (session) =>
    session.query(`DROP DATABASE ${dialect.quote(name)}`),
  )
}

export async function getTables(config: DatabaseConfig): Promise<DatabaseTable[]> {
  assertConnection(config)
  const dialect = dialectFor(config.type)
  return withSession(config, (session) => listTables(session, dialect))
}

export async function createTable(config: DatabaseConfig, tableConfig: TableCreationConfig): Promise<void> {
  assertConnection(config)
  if (!tableConfig.tableName.trim()) throw new Error("Table name is required")
  if (tableConfig.columns.length === 0) throw new Error("A table needs at least one column")

  const dialect = dialectFor(config.type)
  await withSession(config, (session) => session.query(createTableSql(dialect, tableConfig.tableName, tableConfig)))
}

/** How one insert is cut into transactions. `batchSize: 0` means a single one. */
export interface InsertBatchOptions {
  batchSize: number
  continueOnBatchError: boolean
  /** Drop rows whose every cell is blank — trailing Excel rows, usually. */
  skipEmptyRows: boolean
}

/**
 * Inserts every row, in chunks, over one session — one transaction per chunk.
 *
 * Chunking is what makes a large import survivable: a chunk that fails costs
 * only its own rows, and with `continueOnBatchError` the chunks after it still
 * run. `batchSize: 0` is the original behaviour and stays the default for any
 * caller that does not ask for batching: one transaction, all or nothing.
 *
 * Values are passed through untouched: NULL stays NULL, and a failed chunk is
 * rolled back rather than having rows silently dropped or invented.
 *
 * A batch failure is *reported*, never swallowed — the caller decides whether it
 * is an error (see `insertData`) or a partial success with telemetry.
 */
export async function insertDataInBatches(
  config: DatabaseConfig,
  tableName: string,
  columnNames: string[],
  rows: unknown[][],
  options: InsertBatchOptions,
): Promise<{ insertedRows: number; skippedRows: number; totalBatches: number; batches: InsertBatchOutcome[] }> {
  assertConnection(config)
  if (rows.length === 0) return { insertedRows: 0, skippedRows: 0, totalBatches: 0, batches: [] }

  const dialect = dialectFor(config.type)
  const columns = columnNames.map((column) => dialect.quote(column)).join(", ")
  const values = columnNames.map((_, index) => dialect.placeholder(index)).join(", ")
  const statement = `INSERT INTO ${dialect.quote(tableName)} (${columns}) VALUES (${values})`

  const writable = options.skipEmptyRows ? rows.filter((row) => !row.every(isBlankCell)) : rows
  const skippedRows = rows.length - writable.length
  const size = options.batchSize > 0 ? options.batchSize : Math.max(writable.length, 1)

  const chunks: unknown[][][] = []
  for (let start = 0; start < writable.length; start += size) {
    chunks.push(writable.slice(start, start + size))
  }

  return withSession(config, async (session) => {
    const batches: InsertBatchOutcome[] = []
    let insertedRows = 0

    for (const [index, chunk] of chunks.entries()) {
      try {
        let written = 0
        await session.transaction(async (query) => {
          for (const row of chunk) {
            await query(statement, row)
            written += 1
          }
        })
        insertedRows += written
        batches.push({ batch: index + 1, rows: chunk.length, insertedRows: written })
      } catch (error) {
        batches.push({ batch: index + 1, rows: chunk.length, insertedRows: 0, error: errorMessage(error) })
        if (!options.continueOnBatchError) break
      }
    }

    return { insertedRows, skippedRows, totalBatches: chunks.length, batches }
  })
}

/**
 * Inserts every row in one transaction, throwing on the first failure. This is
 * the contract every earlier caller has: a NOT NULL violation aborts the whole
 * batch rather than leaving part of it behind.
 */
export async function insertData(
  config: DatabaseConfig,
  tableName: string,
  columnNames: string[],
  rows: unknown[][],
): Promise<{ insertedRows: number }> {
  const result = await insertDataInBatches(config, tableName, columnNames, rows, {
    batchSize: 0,
    continueOnBatchError: false,
    skipEmptyRows: true,
  })

  const failure = result.batches.find((batch) => batch.error)
  if (failure) throw new Error(failure.error)

  return { insertedRows: result.insertedRows }
}

/**
 * One window of a table plus an exact `COUNT(*)`. Without an `orderBy` the
 * engine picks the order, so the window is a sample rather than a stable page.
 */
export async function previewTable(
  config: DatabaseConfig,
  tableName: string,
  options: number | PreviewOptions = {},
): Promise<{ columns: string[]; data: unknown[][]; totalRows: number }> {
  assertConnection(config)
  const dialect = dialectFor(config.type)
  // A bare number is the signature from before paging existed.
  const page: PreviewOptions = typeof options === "number" ? { limit: options } : options
  const { limit = 10, offset = 0, orderBy, direction = "asc" } = page

  return withSession(config, async (session) => {
    const rows = await session.query<Record<string, unknown>>(
      dialect.pageSql(tableName, { limit, offset, orderBy, direction }),
    )
    const columns =
      rows.length > 0
        ? Object.keys(rows[0])
        : (await session.query<Record<string, unknown>>(dialect.columnsSql(tableName))).map((column) =>
            String(column.name),
          )

    const count = await session.query<{ cnt: unknown }>(dialect.countSql(tableName))

    return {
      columns,
      data: rows.map((row) => columns.map((column) => row[column])),
      totalRows: Number(count[0]?.cnt ?? rows.length),
    }
  })
}

export async function getTableStructure(config: DatabaseConfig, tableName: string): Promise<DatabaseColumn[]> {
  assertConnection(config)
  const dialect = dialectFor(config.type)

  return withSession(config, async (session) =>
    mapColumns(await session.query<Record<string, unknown>>(dialect.columnsSql(tableName))),
  )
}

export async function alterTable(
  config: DatabaseConfig,
  tableName: string,
  change: AlterAction,
): Promise<{ message: string }> {
  assertConnection(config)
  const dialect = dialectFor(config.type)

  return withSession(config, async (session) => {
    switch (change.action) {
      case "add-column": {
        await session.query(dialect.addColumnSql(tableName, change.column))
        return { message: `Column "${change.column.name}" added to "${tableName}"` }
      }
      case "drop-column": {
        await session.query(dialect.dropColumnSql(tableName, change.column))
        return { message: `Column "${change.column}" dropped from "${tableName}"` }
      }
      case "rename-column": {
        await session.query(dialect.renameColumnSql(tableName, change.from, change.to))
        return { message: `Column "${change.from}" renamed to "${change.to}"` }
      }
      case "rename-table": {
        await session.query(dialect.renameTableSql(tableName, change.to))
        return { message: `Table "${tableName}" renamed to "${change.to}"` }
      }
      case "change-type": {
        const statements = dialect.changeTypeSql(tableName, change.column, change.type, change.nullable)
        if (statements === null) return rebuildColumnType(session, dialect, tableName, change)
        for (const statement of statements) await session.query(statement)
        return { message: `Column "${change.column}" is now ${change.type}` }
      }
    }
  })
}

/**
 * SQLite has no ALTER COLUMN, so the documented rebuild runs instead: build the
 * table again with the new definition, move every row across, then swap the two
 * in one transaction. Column names, types, nullability and the primary key
 * survive; defaults do not, because introspection hands them back as SQL
 * fragments this code would have to re-emit verbatim to keep them.
 */
async function rebuildColumnType(
  session: Session,
  dialect: Dialect,
  tableName: string,
  change: Extract<AlterAction, { action: "change-type" }>,
): Promise<{ message: string }> {
  const existing = mapColumns(await session.query<Record<string, unknown>>(dialect.columnsSql(tableName)))
  if (existing.length === 0) throw new Error(`Table "${tableName}" has no columns to rebuild`)

  const columns: GridColumn[] = existing.map((column) =>
    column.name === change.column
      ? { ...column, type: change.type, nullable: change.nullable }
      : { name: column.name, type: column.type, nullable: column.nullable, isPrimaryKey: column.isPrimaryKey },
  )
  const definition = createTableFromColumnsSql(
    dialect,
    REBUILD_TABLE,
    columns,
    columns.find((column) => column.isPrimaryKey)?.name,
  )
  const names = columns.map((column) => dialect.quote(column.name)).join(", ")

  await session.transaction(async (query) => {
    await query(definition)
    await query(
      `INSERT INTO ${dialect.quote(REBUILD_TABLE)} (${names}) SELECT ${names} FROM ${dialect.quote(tableName)}`,
    )
    await query(`DROP TABLE ${dialect.quote(tableName)}`)
    await query(dialect.renameTableSql(REBUILD_TABLE, tableName))
  })

  return { message: `Column "${change.column}" is now ${change.type}` }
}

export async function dropTable(config: DatabaseConfig, tableName: string): Promise<void> {
  assertConnection(config)
  const dialect = dialectFor(config.type)
  await withSession(config, (session) => session.query(`DROP TABLE ${dialect.quote(tableName)}`))
}

/**
 * `DELETE FROM` rather than `TRUNCATE`: it is the one statement all four engines
 * accept, it can be rolled back, and it leaves the count of removed rows
 * available — which is what the caller shows the user.
 */
export async function truncateTable(config: DatabaseConfig, tableName: string): Promise<{ deletedRows: number }> {
  assertConnection(config)
  const dialect = dialectFor(config.type)

  return withSession(config, async (session) => {
    const count = await session.query<{ cnt: unknown }>(dialect.countSql(tableName))
    await session.transaction((query) => query(`DELETE FROM ${dialect.quote(tableName)}`))
    return { deletedRows: Number(count[0]?.cnt ?? 0) }
  })
}

/**
 * Applies one batch of row edits in a single transaction. The engines report
 * affected rows in four different ways (and not at all without RETURNING or
 * OUTPUT), so the matching rows are counted before each statement — one extra
 * read that behaves the same everywhere, including on keys that match nothing.
 */
export async function mutateRows(
  config: DatabaseConfig,
  tableName: string,
  mutation: RowMutation,
): Promise<{ affectedRows: number }> {
  assertConnection(config)
  const dialect = dialectFor(config.type)
  const table = dialect.quote(tableName)

  if (mutation.action === "insert") {
    const records = mutation.records ?? []
    if (records.length === 0) return { affectedRows: 0 }

    // The column list is the union of the keys the records carry, in first-seen
    // order; a record that omits one of them binds NULL for it.
    const columns = [...new Set(records.flatMap((record) => Object.keys(record)))]
    if (columns.length === 0) throw new Error("An insert needs at least one column")
    const names = columns.map((column) => dialect.quote(column)).join(", ")
    const placeholders = columns.map((_, index) => dialect.placeholder(index)).join(", ")

    return withSession(config, async (session) => {
      await session.transaction(async (query) => {
        for (const record of records) {
          await query(`INSERT INTO ${table} (${names}) VALUES (${placeholders})`, columns.map((column) => record[column] ?? null))
        }
      })
      return { affectedRows: records.length }
    })
  }

  const target = mutation.target
  if (!target?.primaryKey?.trim()) throw new Error(`A ${mutation.action} needs the primary key column it targets`)
  if (target.keys.length === 0) throw new Error(`A ${mutation.action} needs at least one key`)
  const key = dialect.quote(target.primaryKey)

  if (mutation.action === "delete") {
    return withSession(config, async (session) => {
      let affectedRows = 0
      await session.transaction(async (query) => {
        for (let start = 0; start < target.keys.length; start += MAX_KEYS_PER_STATEMENT) {
          const keys = target.keys.slice(start, start + MAX_KEYS_PER_STATEMENT)
          const placeholders = keys.map((_, index) => dialect.placeholder(index)).join(", ")
          const where = `${key} IN (${placeholders})`
          const found = await query<{ cnt: unknown }>(`SELECT COUNT(*) AS cnt FROM ${table} WHERE ${where}`, keys)
          affectedRows += Number(found[0]?.cnt ?? 0)
          await query(`DELETE FROM ${table} WHERE ${where}`, keys)
        }
      })
      return { affectedRows }
    })
  }

  const records = mutation.records ?? []
  if (records.length !== target.keys.length) {
    throw new Error(`An update needs one record per key; got ${records.length} for ${target.keys.length} keys`)
  }

  return withSession(config, async (session) => {
    let affectedRows = 0
    await session.transaction(async (query) => {
      for (const [index, value] of target.keys.entries()) {
        const record = records[index]
        const columns = Object.keys(record)
        if (columns.length === 0) throw new Error(`The record for key ${index} has no columns to update`)

        const assignments = columns
          .map((column, position) => `${dialect.quote(column)} = ${dialect.placeholder(position)}`)
          .join(", ")
        const where = `${key} IN (${dialect.placeholder(columns.length)})`
        const found = await query<{ cnt: unknown }>(`SELECT COUNT(*) AS cnt FROM ${table} WHERE ${where}`, [value])
        affectedRows += Number(found[0]?.cnt ?? 0)
        await query(`UPDATE ${table} SET ${assignments} WHERE ${where}`, [
          ...columns.map((column) => record[column] ?? null),
          value,
        ])
      }
    })
    return { affectedRows }
  })
}

export async function runQuery(
  config: DatabaseConfig,
  sql: string,
  options: { maxRows?: number; allowWrite?: boolean } = {},
): Promise<QueryResult> {
  assertConnection(config)
  const { maxRows = DEFAULT_MAX_ROWS, allowWrite = false } = options
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > MAX_MAX_ROWS) {
    throw new Error(`maxRows must be a whole number between 1 and ${MAX_MAX_ROWS}`)
  }

  const analysis = analyseSql(sql)
  if (analysis.blockedReason) throw new Error(analysis.blockedReason)
  if (!analysis.readOnly && !allowWrite) {
    throw new Error(`"${analysis.verbs[0].toUpperCase()}" changes the database; turn on write access to run it`)
  }

  const dialect = dialectFor(config.type)
  const statement = analysis.statements[0]
  // A read-only statement is wrapped so the engine itself stops one row past the
  // cap. SHOW/DESCRIBE/EXPLAIN cannot be subqueried, and return few rows anyway,
  // so those are sliced here instead.
  const prepared = WRAPPABLE_VERBS[analysis.verbs[0]] ? dialect.limitSql(statement, maxRows + 1) : statement

  return withSession(config, async (session) => {
    const startedAt = Date.now()
    const rows = await session.query<Record<string, unknown>>(prepared)
    const durationMs = Date.now() - startedAt
    const columns = rows.length > 0 ? Object.keys(rows[0]) : []

    return {
      columns,
      data: rows.slice(0, maxRows).map((row) => columns.map((column) => row[column])),
      truncated: rows.length > maxRows,
      durationMs,
    }
  })
}

export async function copyTable(
  config: DatabaseConfig,
  source: string,
  target: string,
  mode: "create" | "append" | "replace",
): Promise<{ copiedRows: number }> {
  assertConnection(config)
  const dialect = dialectFor(config.type)

  return withSession(config, async (session) => {
    const sourceCount = Number((await session.query<{ cnt: unknown }>(dialect.countSql(source)))[0]?.cnt ?? 0)

    if (mode === "create") {
      // CREATE TABLE … AS SELECT refuses an existing target on its own.
      await session.query(dialect.createTableAsSql(target, source))
      return { copiedRows: sourceCount }
    }

    // Rows are matched by column name, so only the names both tables have can travel.
    const sourceColumns = await columnNames(session.query, dialect, source)
    const targetColumns = await columnNames(session.query, dialect, target)
    const shared = sourceColumns.filter((column) => targetColumns.includes(column))
    if (shared.length === 0) {
      throw new Error(`"${source}" and "${target}" share no column names, so there is nothing to copy`)
    }
    const insert = dialect.insertFromSelectSql(target, shared, source)

    if (mode === "append") {
      await session.transaction((query) => query(insert))
      return { copiedRows: sourceCount }
    }

    return session.transaction(async (query) => {
      await query(`DELETE FROM ${dialect.quote(target)}`)
      await query(insert)
      return { copiedRows: sourceCount }
    })
  })
}

/* ---------------------------------------------------------------------------
 * Snapshots
 *
 * A snapshot is a real table holding a copy of another table's rows, plus one
 * row in the registry saying where it came from. Nothing about it is
 * engine-specific, so it works on all four engines unchanged.
 * ------------------------------------------------------------------------- */

/**
 * The registry is created on demand: a connection that only reads never needs
 * it. Two callers racing to create it is fine — the loser gets the engine's
 * "already exists", which means the table is there.
 */
async function ensureRegistry(session: Session, dialect: Dialect): Promise<void> {
  try {
    await session.query(dialect.registrySql())
  } catch (error) {
    if (!/already exists|already an object named/i.test(errorMessage(error))) throw error
  }
}

/**
 * `_ingesta_snap_<source>_<yyyyMMddHHmmss>`, trimmed to fit the engine's
 * identifier limit: the prefix and the stamp are fixed, the source is shortened.
 */
function generatedSnapshotName(dialect: Dialect, tableName: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")
  const budget = dialect.identifierLimit - SNAPSHOT_PREFIX.length - stamp.length - 1
  return `${SNAPSHOT_PREFIX}${sanitizeTableName(tableName).slice(0, Math.max(budget, 1))}_${stamp}`
}

/** The table a snapshot was taken from, or a clear error when the name is unknown. */
async function snapshotSource(session: Session, dialect: Dialect, snapshotName: string): Promise<string> {
  const rows = await session.query<Record<string, unknown>>(
    `SELECT ${dialect.quote("source_table")} FROM ${dialect.quote(SNAPSHOT_REGISTRY)} WHERE ${dialect.quote("name")} = ${dialect.placeholder(0)}`,
    [snapshotName],
  )
  const source = rows[0]?.source_table
  if (source == null) throw new Error(`Snapshot "${snapshotName}" is not in the snapshot registry`)
  return String(source)
}

export async function listSnapshots(config: DatabaseConfig): Promise<TableSnapshot[]> {
  assertConnection(config)
  const dialect = dialectFor(config.type)

  return withSession(config, async (session) => {
    await ensureRegistry(session, dialect)
    const rows = await session.query<Record<string, unknown>>(
      `SELECT ${dialect.quote("name")}, ${dialect.quote("source_table")}, ${dialect.quote("row_count")}, ${dialect.quote("created_at")} FROM ${dialect.quote(SNAPSHOT_REGISTRY)} ORDER BY ${dialect.quote("created_at")} DESC, ${dialect.quote("name")} DESC`,
    )

    return rows.map((row) => ({
      name: String(row.name),
      table: String(row.source_table),
      rowCount: Number(row.row_count ?? 0),
      createdAt: String(row.created_at ?? ""),
    }))
  })
}

export async function createSnapshot(
  config: DatabaseConfig,
  tableName: string,
  name?: string,
): Promise<TableSnapshot> {
  assertConnection(config)
  const dialect = dialectFor(config.type)

  return withSession(config, async (session) => {
    await ensureRegistry(session, dialect)

    // A caller-supplied name is sanitised, prefixed and trimmed too, so every
    // snapshot stays out of the table explorer and inside the engine's limit.
    const storage = name?.trim()
      ? `${SNAPSHOT_PREFIX}${sanitizeTableName(name)}`.slice(0, dialect.identifierLimit)
      : generatedSnapshotName(dialect, tableName)
    const createdAt = new Date().toISOString()
    const count = await session.query<{ cnt: unknown }>(dialect.countSql(tableName))
    const rowCount = Number(count[0]?.cnt ?? 0)
    const registry = dialect.quote(SNAPSHOT_REGISTRY)
    const columns = ["name", "source_table", "row_count", "created_at"].map((column) => dialect.quote(column)).join(", ")
    const values = ["name", "source_table", "row_count", "created_at"]
      .map((_, index) => dialect.placeholder(index))
      .join(", ")

    await session.transaction(async (query) => {
      await query(dialect.createTableAsSql(storage, tableName))
      await query(`INSERT INTO ${registry} (${columns}) VALUES (${values})`, [storage, tableName, rowCount, createdAt])
    })

    return { name: storage, table: tableName, rowCount, createdAt }
  })
}

/** Empties the source and refills it from the snapshot, in one transaction. */
export async function restoreSnapshot(
  config: DatabaseConfig,
  snapshotName: string,
): Promise<{ restoredRows: number }> {
  assertConnection(config)
  const dialect = dialectFor(config.type)

  return withSession(config, async (session) => {
    await ensureRegistry(session, dialect)
    const source = await snapshotSource(session, dialect, snapshotName)
    const columns = await columnNames(session.query, dialect, snapshotName)

    return session.transaction(async (query) => {
      const count = await query<{ cnt: unknown }>(dialect.countSql(snapshotName))
      const restoredRows = Number(count[0]?.cnt ?? 0)
      await query(`DELETE FROM ${dialect.quote(source)}`)
      await query(dialect.insertFromSelectSql(source, columns, snapshotName))
      return { restoredRows }
    })
  })
}

export async function dropSnapshot(config: DatabaseConfig, snapshotName: string): Promise<void> {
  assertConnection(config)
  const dialect = dialectFor(config.type)

  await withSession(config, async (session) => {
    await ensureRegistry(session, dialect)
    // Only tables the registry knows about can be dropped through here, so a
    // mistyped name cannot take a user's table with it.
    await snapshotSource(session, dialect, snapshotName)

    await session.transaction(async (query) => {
      await query(`DROP TABLE ${dialect.quote(snapshotName)}`)
      await query(
        `DELETE FROM ${dialect.quote(SNAPSHOT_REGISTRY)} WHERE ${dialect.quote("name")} = ${dialect.placeholder(0)}`,
        [snapshotName],
      )
    })
  })
}
