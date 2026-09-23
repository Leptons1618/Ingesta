import type { Database as SqliteDatabase } from "sqlite3"

import type { DatabaseConfig, DatabaseType, ServerOptions, TableCreationConfig } from "@/lib/types"
import { adaptTypeForDatabase } from "@/lib/schema"

export type Row = Record<string, unknown>
export type QueryFn = <T = Row>(sql: string, params?: unknown[]) => Promise<T[]>

export interface Session {
  query: QueryFn
  /** Runs `fn` inside a transaction and rolls back when it throws. */
  transaction<T>(fn: (query: QueryFn) => Promise<T>): Promise<T>
  close(): Promise<void>
}

/**
 * Everything that actually differs between the four supported engines:
 * identifier quoting, parameter syntax, DDL specifics, and the driver.
 * Every operation in `lib/db/index.ts` is written once against this.
 */
export interface Dialect {
  type: DatabaseType
  quote(identifier: string): string
  placeholder(index: number): string
  /** Column added when the caller did not nominate a primary key. */
  autoIdColumn: string
  /** Admin database to connect to when enumerating servers (undefined = can omit). */
  adminDatabase?: string
  /** Lists databases on the server; absent for engines without that concept. */
  databasesSql?: string
  tablesSql: string
  columnsSql(table: string): string
  countSql(table: string): string
  previewSql(table: string, limit: number): string
  versionSql: string
  serverVersion(raw: string): string
  open(options: ServerOptions | DatabaseConfig): Promise<Session>
}

/** Escapes a value as a SQL string literal (used for identifiers read from the DB itself). */
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`

export function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || String(value).toUpperCase() === "YES"
}

/** Applies `fn`, closing the session whether it resolves or throws. */
export async function withSession<T>(
  options: ServerOptions | DatabaseConfig,
  fn: (session: Session) => Promise<T>,
): Promise<T> {
  const session = await dialectFor(options.type).open(options)
  try {
    return await fn(session)
  } finally {
    await session.close()
  }
}

const postgres: Dialect = {
  type: "postgresql",
  quote: (identifier) => `"${identifier.replace(/"/g, '""')}"`,
  placeholder: (index) => `$${index + 1}`,
  autoIdColumn: "id SERIAL PRIMARY KEY",
  adminDatabase: "postgres",
  databasesSql: "SELECT datname AS name FROM pg_database WHERE datistemplate = false ORDER BY datname",
  tablesSql:
    "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  columnsSql: (table) => `
    SELECT c.column_name AS name,
           c.data_type AS type,
           c.is_nullable AS nullable,
           c.column_default AS "default",
           (pk.attname IS NOT NULL) AS pk
    FROM information_schema.columns c
    LEFT JOIN (
      SELECT a.attname
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = ${literal(table)}::regclass AND i.indisprimary
    ) pk ON pk.attname = c.column_name
    WHERE c.table_schema = 'public' AND c.table_name = ${literal(table)}
    ORDER BY c.ordinal_position`,
  countSql: (table) => `SELECT COUNT(*) AS cnt FROM ${postgres.quote(table)}`,
  previewSql: (table, limit) => `SELECT * FROM ${postgres.quote(table)} LIMIT ${limit}`,
  versionSql: "SELECT version() AS version",
  serverVersion: (raw) => raw.split(" ")[1] ?? raw,
  async open(options) {
    // Native driver: imported lazily so it never enters the client bundle.
    const { Client } = await import("pg")
    const client = new Client(
      (options as DatabaseConfig).connectionString || {
        host: options.host,
        port: options.port ?? 5432,
        database: options.database,
        user: options.username,
        password: options.password,
        ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
      },
    )
    await client.connect()

    const query: QueryFn = async (sql, params) => (await client.query(sql, params as never)).rows as never

    return {
      query,
      async transaction(fn) {
        await query("BEGIN")
        try {
          const result = await fn(query)
          await query("COMMIT")
          return result
        } catch (error) {
          await query("ROLLBACK").catch(() => {})
          throw error
        }
      },
      close: () => client.end().catch(() => {}),
    }
  },
}

const mysql: Dialect = {
  type: "mysql",
  quote: (identifier) => `\`${identifier.replace(/`/g, "``")}\``,
  placeholder: () => "?",
  autoIdColumn: "id INT AUTO_INCREMENT PRIMARY KEY",
  databasesSql: "SELECT SCHEMA_NAME AS name FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME",
  tablesSql:
    "SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
  columnsSql: (table) => `
    SELECT COLUMN_NAME AS name,
           COLUMN_TYPE AS type,
           IS_NULLABLE AS nullable,
           COLUMN_DEFAULT AS \`default\`,
           (COLUMN_KEY = 'PRI') AS pk
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${literal(table)}
    ORDER BY ORDINAL_POSITION`,
  countSql: (table) => `SELECT COUNT(*) AS cnt FROM ${mysql.quote(table)}`,
  previewSql: (table, limit) => `SELECT * FROM ${mysql.quote(table)} LIMIT ${limit}`,
  versionSql: "SELECT VERSION() AS version",
  serverVersion: (raw) => raw,
  async open(options) {
    // Native driver: imported lazily so it never enters the client bundle.
    const driver = await import("mysql2/promise")
    const connection = await driver.createConnection({
      host: options.host,
      port: options.port ?? 3306,
      user: options.username,
      password: options.password,
      database: options.database,
      ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
    })

    const run = async (sql: string, params?: unknown[]) => {
      const [rows] = await connection.query(sql, params as never)
      return (Array.isArray(rows) ? rows : []) as Row[]
    }

    return {
      query: run as QueryFn,
      async transaction(fn) {
        await connection.beginTransaction()
        try {
          const result = await fn(run as QueryFn)
          await connection.commit()
          return result
        } catch (error) {
          await connection.rollback().catch(() => {})
          throw error
        }
      },
      close: () => connection.end().catch(() => {}),
    }
  },
}

const sqlite: Dialect = {
  type: "sqlite",
  quote: (identifier) => `"${identifier.replace(/"/g, '""')}"`,
  placeholder: () => "?",
  autoIdColumn: "id INTEGER PRIMARY KEY AUTOINCREMENT",
  tablesSql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  // The table-valued pragma lets SQLite return the same column keys as the others.
  // `notnull` is a keyword in recent SQLite builds, so it has to be quoted.
  columnsSql: (table) =>
    `SELECT name, type, ("notnull" = 0) AS nullable, dflt_value AS "default", pk FROM pragma_table_info(${literal(table)})`,
  countSql: (table) => `SELECT COUNT(*) AS cnt FROM ${sqlite.quote(table)}`,
  previewSql: (table, limit) => `SELECT * FROM ${sqlite.quote(table)} LIMIT ${limit}`,
  versionSql: "SELECT sqlite_version() AS version",
  serverVersion: (raw) => `SQLite ${raw}`,
  async open(options) {
    // Native driver: imported lazily so it never enters the client bundle.
    const driver = await import("sqlite3")
    const { Database } = driver.default.verbose()
    const path = options.database ?? ""

    const db = await new Promise<SqliteDatabase>((resolve, reject) => {
      const instance = new Database(path, (error: Error | null) => (error ? reject(error) : resolve(instance)))
    })

    const run = (sql: string, params: unknown[] = []) =>
      new Promise<Row[]>((resolve, reject) => {
        // node-sqlite3 binds numbers, strings, bigints, buffers and null only.
        const bound = params.map((value) => (typeof value === "boolean" ? Number(value) : value))
        db.all(sql, bound, (error: Error | null, rows: Row[]) => (error ? reject(error) : resolve(rows ?? [])))
      })

    return {
      query: run as QueryFn,
      async transaction(fn) {
        await run("BEGIN TRANSACTION")
        try {
          const result = await fn(run as QueryFn)
          await run("COMMIT")
          return result
        } catch (error) {
          await run("ROLLBACK").catch(() => {})
          throw error
        }
      },
      close: () =>
        new Promise<void>((resolve) => {
          db.close(() => resolve())
        }),
    }
  },
}

const mssql: Dialect = {
  type: "mssql",
  quote: (identifier) => `[${identifier.replace(/]/g, "]]")}]`,
  placeholder: (index) => `@p${index}`,
  autoIdColumn: "id INT IDENTITY(1,1) PRIMARY KEY",
  adminDatabase: "master",
  databasesSql:
    "SELECT name FROM sys.databases WHERE name NOT IN ('master','tempdb','model','msdb') ORDER BY name",
  tablesSql:
    "SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
  columnsSql: (table) => `
    SELECT c.COLUMN_NAME AS name,
           c.DATA_TYPE AS type,
           c.IS_NULLABLE AS nullable,
           NULL AS [default],
           (pk.COLUMN_NAME IS NOT NULL) AS pk
    FROM INFORMATION_SCHEMA.COLUMNS c
    LEFT JOIN (
      SELECT kcu.COLUMN_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      WHERE tc.TABLE_NAME = ${literal(table)} AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
    ) pk ON pk.COLUMN_NAME = c.COLUMN_NAME
    WHERE c.TABLE_NAME = ${literal(table)}
    ORDER BY c.ORDINAL_POSITION`,
  countSql: (table) => `SELECT COUNT(*) AS cnt FROM ${mssql.quote(table)}`,
  previewSql: (table, limit) => `SELECT TOP (${limit}) * FROM ${mssql.quote(table)}`,
  versionSql: "SELECT @@VERSION AS version",
  serverVersion: (raw) => raw.split("\n")[0].trim(),
  async open(options) {
    // Native driver: imported lazily so it never enters the client bundle.
    const driver = await import("mssql")
    const pool = await new driver.ConnectionPool({
      server: options.host ?? "localhost",
      port: options.port ?? 1433,
      database: options.database,
      user: options.username,
      password: options.password,
      options: { encrypt: Boolean(options.ssl), trustServerCertificate: true },
    }).connect()

    /** node-mssql needs an explicit type for NULL and for anything non-primitive. */
    const typeOf = (value: unknown) => {
      if (value === null || value === undefined) return driver.NVarChar
      if (typeof value === "boolean") return driver.Bit
      if (typeof value === "number") return Number.isInteger(value) ? driver.BigInt : driver.Float
      if (value instanceof Date) return driver.DateTime2
      return driver.NVarChar
    }

    const request = async (target: unknown, sql: string, params?: unknown[]) => {
      const req = new driver.Request(target as never)
      params?.forEach((value, index) => req.input(`p${index}`, typeOf(value), value ?? null))
      const result = await req.query(sql)
      return (result.recordset ?? []) as Row[]
    }

    const query: QueryFn = (sql, params) => request(pool, sql, params) as never

    return {
      query,
      async transaction(fn) {
        const transaction = new driver.Transaction(pool)
        await transaction.begin()
        try {
          const result = await fn(((sql, params) => request(transaction, sql, params)) as QueryFn)
          await transaction.commit()
          return result
        } catch (error) {
          await transaction.rollback().catch(() => {})
          throw error
        }
      },
      close: () => pool.close().catch(() => {}),
    }
  },
}

const dialects: Record<DatabaseType, Dialect> = { postgresql: postgres, mysql, sqlite, mssql }

export function dialectFor(type: DatabaseType): Dialect {
  const dialect = dialects[type]
  if (!dialect) throw new Error(`Unsupported database type: ${type}`)
  return dialect
}

/** Builds the CREATE TABLE statement shared by every engine. */
export function createTableSql(dialect: Dialect, tableName: string, config: TableCreationConfig): string {
  const definitions = config.columns.map((column) => {
    const type = adaptTypeForDatabase(column.suggestedType, dialect.type)
    return `${dialect.quote(column.name)} ${type}${column.nullable ? "" : " NOT NULL"}`
  })

  const primaryKey = config.columns.find((column) => column.name === config.primaryKey)
  if (primaryKey) {
    definitions.push(`PRIMARY KEY (${dialect.quote(primaryKey.name)})`)
  } else {
    definitions.unshift(dialect.autoIdColumn)
  }

  return `CREATE TABLE ${dialect.quote(tableName)} (\n  ${definitions.join(",\n  ")}\n)`
}
