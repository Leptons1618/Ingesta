import { errorMessage } from "@/lib/utils"
import type {
  ConnectionTestResult,
  DatabaseConfig,
  DatabaseTable,
  ServerOptions,
  TableCreationConfig,
} from "@/lib/types"

import { createTableSql, dialectFor, toBoolean, withSession, type Dialect, type Session } from "./dialect"

export type { Session } from "./dialect"

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

async function listTables(session: Session, dialect: Dialect): Promise<DatabaseTable[]> {
  const tables = await session.query<{ name: string }>(dialect.tablesSql)

  return Promise.all(
    tables.map(async ({ name }) => {
      const columns = await session.query<Record<string, unknown>>(dialect.columnsSql(name))
      let rowCount: number | undefined
      try {
        // ponytail: COUNT(*) per table; switch to a stats-table read if schemas get large.
        rowCount = Number((await session.query<{ cnt: unknown }>(dialect.countSql(name)))[0]?.cnt)
      } catch {
        // Counting can be denied by permissions; a missing count is not an error.
      }

      return {
        name,
        rowCount,
        columns: columns.map((column) => ({
          name: String(column.name),
          type: String(column.type ?? "").toUpperCase(),
          nullable: toBoolean(column.nullable),
          isPrimaryKey: toBoolean(column.pk),
          defaultValue: column.default == null ? undefined : String(column.default),
        })),
      }
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

/**
 * Inserts every row in one transaction. Values are passed through untouched:
 * NULL stays NULL, and a NOT NULL violation aborts the whole batch rather than
 * silently dropping rows or inventing placeholder values.
 */
export async function insertData(
  config: DatabaseConfig,
  tableName: string,
  columnNames: string[],
  rows: unknown[][],
): Promise<{ insertedRows: number }> {
  assertConnection(config)
  if (rows.length === 0) return { insertedRows: 0 }

  const dialect = dialectFor(config.type)
  const columns = columnNames.map((column) => dialect.quote(column)).join(", ")
  const values = columnNames.map((_, index) => dialect.placeholder(index)).join(", ")
  const statement = `INSERT INTO ${dialect.quote(tableName)} (${columns}) VALUES (${values})`

  return withSession(config, async (session) => {
    let insertedRows = 0
    await session.transaction(async (query) => {
      for (const row of rows) {
        if (row.every((cell) => cell === null || cell === undefined || cell === "")) continue
        await query(statement, row)
        insertedRows += 1
      }
    })
    return { insertedRows }
  })
}

export async function previewTable(
  config: DatabaseConfig,
  tableName: string,
  limit = 10,
): Promise<{ columns: string[]; data: unknown[][]; totalRows: number }> {
  assertConnection(config)
  const dialect = dialectFor(config.type)

  return withSession(config, async (session) => {
    const rows = await session.query<Record<string, unknown>>(dialect.previewSql(tableName, limit))
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
