import type { Database as SqliteDatabase } from "sqlite3"

import type {
  DatabaseConfig,
  DatabaseType,
  GridColumn,
  ServerOptions,
  SortDirection,
  TableCreationConfig,
} from "@/lib/types"
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
 * Tables the app keeps for itself. The shared prefix is what hides them from
 * the table explorer, so anything named here is never mistaken for user data.
 */
export const INGESTA_PREFIX = "_ingesta_"
export const SNAPSHOT_REGISTRY = `${INGESTA_PREFIX}snapshots`
export const SNAPSHOT_PREFIX = `${INGESTA_PREFIX}snap_`
export const REBUILD_TABLE = `${INGESTA_PREFIX}rebuild`

/** One window of a table, in the order the caller asked for. */
export interface PageOptions {
  limit: number
  offset: number
  orderBy?: string
  direction: SortDirection
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
  /** Longest identifier the engine accepts; generated names are truncated to it. */
  identifierLimit: number
  /** Admin database to connect to when enumerating servers (undefined = can omit). */
  adminDatabase?: string
  /** Lists databases on the server; absent for engines without that concept. */
  databasesSql?: string
  tablesSql: string
  columnsSql(table: string): string
  countSql(table: string): string
  versionSql: string
  serverVersion(raw: string): string
  /** MSSQL has no `CREATE TABLE … AS SELECT`, so the copy shape is per-engine. */
  createTableAsSql(target: string, source: string): string
  insertFromSelectSql(target: string, columns: string[], source: string): string
  pageSql(table: string, page: PageOptions): string
  /** Wraps a read-only statement so the engine stops after `limit` rows. */
  limitSql(sql: string, limit: number): string
  addColumnSql(table: string, column: GridColumn): string
  dropColumnSql(table: string, column: string): string
  renameColumnSql(table: string, from: string, to: string): string
  /** Statements that change a column's type; `null` when the engine rebuilds instead. */
  changeTypeSql(table: string, column: string, type: string, nullable: boolean): string[] | null
  renameTableSql(table: string, to: string): string
  /** DDL for the snapshot registry, which is created on demand and may already exist. */
  registrySql(): string
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

/* ---------------------------------------------------------------------------
 * Statement builders
 *
 * These statements are the same text on every engine apart from the quoting,
 * so each dialect hands itself in — exactly like `createTableSql` below.
 * ------------------------------------------------------------------------- */

/** `CREATE TABLE … AS SELECT`; MSSQL spells the same intent `SELECT … INTO`. */
function ctasSql(dialect: Dialect, target: string, source: string): string {
  return `CREATE TABLE ${dialect.quote(target)} AS SELECT * FROM ${dialect.quote(source)}`
}

function insertSelectSql(dialect: Dialect, target: string, columns: string[], source: string): string {
  const names = columns.map((column) => dialect.quote(column)).join(", ")
  return `INSERT INTO ${dialect.quote(target)} (${names}) SELECT ${names} FROM ${dialect.quote(source)}`
}

/** `LIMIT`/`OFFSET` is shared by PostgreSQL, MySQL and SQLite. */
function limitOffsetSql(dialect: Dialect, table: string, page: PageOptions): string {
  const order = page.orderBy
    ? ` ORDER BY ${dialect.quote(page.orderBy)} ${page.direction === "desc" ? "DESC" : "ASC"}`
    : ""
  return `SELECT * FROM ${dialect.quote(table)}${order} LIMIT ${page.limit} OFFSET ${page.offset}`
}

/** MSSQL pages with `ORDER BY … OFFSET … FETCH NEXT`, and demands an ORDER BY to do it. */
function mssqlPageSql(dialect: Dialect, table: string, page: PageOptions): string {
  const order = page.orderBy
    ? `${dialect.quote(page.orderBy)} ${page.direction === "desc" ? "DESC" : "ASC"}`
    : "(SELECT NULL)"
  return `SELECT * FROM ${dialect.quote(table)} ORDER BY ${order} OFFSET ${page.offset} ROWS FETCH NEXT ${page.limit} ROWS ONLY`
}

/**
 * Caps a read on SQL Server.
 *
 * T-SQL rejects `ORDER BY` inside a derived table unless that level also has a
 * `TOP`, and `SELECT … ORDER BY …` is the most ordinary query there is, so the
 * cap goes *into* a leading `SELECT` rather than around the statement. Shapes
 * that cannot take a `TOP` there — `WITH … SELECT`, `VALUES`, anything starting
 * with a comment — keep the wrapper, which is where they were before.
 */
function mssqlLimitSql(sql: string, limit: number): string {
  const head = /^\s*select\s+(?:distinct\s+|all\s+)?/i.exec(sql)
  if (!head) return `SELECT TOP (${limit}) * FROM (${sql}) AS ${mssql.quote("_ingesta_query")}`
  return `${sql.slice(0, head[0].length)}TOP (${limit}) ${sql.slice(head[0].length)}`
}

function addColumnStatement(dialect: Dialect, table: string, column: GridColumn): string {
  const type = adaptTypeForDatabase(column.type, dialect.type)
  return `ALTER TABLE ${dialect.quote(table)} ADD COLUMN ${dialect.quote(column.name)} ${type}${column.nullable ? "" : " NOT NULL"}`
}

function dropColumnStatement(dialect: Dialect, table: string, column: string): string {
  return `ALTER TABLE ${dialect.quote(table)} DROP COLUMN ${dialect.quote(column)}`
}

function renameColumnStatement(dialect: Dialect, table: string, from: string, to: string): string {
  return `ALTER TABLE ${dialect.quote(table)} RENAME COLUMN ${dialect.quote(from)} TO ${dialect.quote(to)}`
}

function renameTableStatement(dialect: Dialect, table: string, to: string): string {
  return `ALTER TABLE ${dialect.quote(table)} RENAME TO ${dialect.quote(to)}`
}

/**
 * The registry of snapshots: one row per snapshot, pointing at the table that
 * holds the rows. Portable types only, because it is created inside whatever
 * engine the user connected to.
 */
function registryDdl(dialect: Dialect): string {
  const column = (name: string, definition: string) =>
    `${dialect.quote(name)} ${adaptTypeForDatabase(definition, dialect.type)} NOT NULL`

  return `CREATE TABLE ${dialect.quote(SNAPSHOT_REGISTRY)} (
  ${column("name", "VARCHAR(255)")},
  ${column("source_table", "VARCHAR(255)")},
  ${column("row_count", "BIGINT")},
  ${column("created_at", "VARCHAR(32)")}
)`
}

const postgres: Dialect = {
  type: "postgresql",
  quote: (identifier) => `"${identifier.replace(/"/g, '""')}"`,
  placeholder: (index) => `$${index + 1}`,
  autoIdColumn: "id SERIAL PRIMARY KEY",
  identifierLimit: 63,
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
  versionSql: "SELECT version() AS version",
  serverVersion: (raw) => raw.split(" ")[1] ?? raw,
  createTableAsSql: (target, source) => ctasSql(postgres, target, source),
  insertFromSelectSql: (target, columns, source) => insertSelectSql(postgres, target, columns, source),
  pageSql: (table, page) => limitOffsetSql(postgres, table, page),
  limitSql: (sql, limit) => `SELECT * FROM (${sql}) AS ${postgres.quote("_ingesta_query")} LIMIT ${limit}`,
  addColumnSql: (table, column) => addColumnStatement(postgres, table, column),
  dropColumnSql: (table, column) => dropColumnStatement(postgres, table, column),
  renameColumnSql: (table, from, to) => renameColumnStatement(postgres, table, from, to),
  // A type change needs the USING clause; nullability is a separate ALTER.
  changeTypeSql: (table, column, type, nullable) => {
    const target = adaptTypeForDatabase(type, "postgresql")
    return [
      `ALTER TABLE ${postgres.quote(table)} ALTER COLUMN ${postgres.quote(column)} TYPE ${target} USING ${postgres.quote(column)}::${target}`,
      `ALTER TABLE ${postgres.quote(table)} ALTER COLUMN ${postgres.quote(column)} ${nullable ? "DROP NOT NULL" : "SET NOT NULL"}`,
    ]
  },
  renameTableSql: (table, to) => renameTableStatement(postgres, table, to),
  registrySql: () => registryDdl(postgres),
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
  identifierLimit: 64,
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
  versionSql: "SELECT VERSION() AS version",
  serverVersion: (raw) => raw,
  createTableAsSql: (target, source) => ctasSql(mysql, target, source),
  insertFromSelectSql: (target, columns, source) => insertSelectSql(mysql, target, columns, source),
  pageSql: (table, page) => limitOffsetSql(mysql, table, page),
  limitSql: (sql, limit) => `SELECT * FROM (${sql}) AS ${mysql.quote("_ingesta_query")} LIMIT ${limit}`,
  addColumnSql: (table, column) => addColumnStatement(mysql, table, column),
  dropColumnSql: (table, column) => dropColumnStatement(mysql, table, column),
  renameColumnSql: (table, from, to) => renameColumnStatement(mysql, table, from, to),
  // MODIFY COLUMN restates the whole definition, so nullability travels with the type.
  changeTypeSql: (table, column, type, nullable) => [
    `ALTER TABLE ${mysql.quote(table)} MODIFY COLUMN ${mysql.quote(column)} ${adaptTypeForDatabase(type, "mysql")}${nullable ? " NULL" : " NOT NULL"}`,
  ],
  renameTableSql: (table, to) => renameTableStatement(mysql, table, to),
  registrySql: () => registryDdl(mysql),
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
  identifierLimit: 63,
  tablesSql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  // The table-valued pragma lets SQLite return the same column keys as the others.
  // `notnull` is a keyword in recent SQLite builds, so it has to be quoted.
  columnsSql: (table) =>
    `SELECT name, type, ("notnull" = 0) AS nullable, dflt_value AS "default", pk FROM pragma_table_info(${literal(table)})`,
  countSql: (table) => `SELECT COUNT(*) AS cnt FROM ${sqlite.quote(table)}`,
  versionSql: "SELECT sqlite_version() AS version",
  serverVersion: (raw) => `SQLite ${raw}`,
  createTableAsSql: (target, source) => ctasSql(sqlite, target, source),
  insertFromSelectSql: (target, columns, source) => insertSelectSql(sqlite, target, columns, source),
  pageSql: (table, page) => limitOffsetSql(sqlite, table, page),
  limitSql: (sql, limit) => `SELECT * FROM (${sql}) AS ${sqlite.quote("_ingesta_query")} LIMIT ${limit}`,
  addColumnSql: (table, column) => addColumnStatement(sqlite, table, column),
  dropColumnSql: (table, column) => dropColumnStatement(sqlite, table, column),
  renameColumnSql: (table, from, to) => renameColumnStatement(sqlite, table, from, to),
  // SQLite has no ALTER COLUMN at all; `lib/db/index.ts` rebuilds the table instead.
  changeTypeSql: () => null,
  renameTableSql: (table, to) => renameTableStatement(sqlite, table, to),
  registrySql: () => registryDdl(sqlite),
  async open(options) {
    // Native driver: imported lazily so it never enters the client bundle.
    const driver = await import("sqlite3")
    const { Database } = driver.default.verbose()
    const path = options.database ?? ""

    const db = await new Promise<SqliteDatabase>((resolve, reject) => {
      // The annotation is required: `instance` is read from the constructor's
      // own callback, so inference would be circular.
      const instance: SqliteDatabase = new Database(path, (error: Error | null) => (error ? reject(error) : resolve(instance)))
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
  identifierLimit: 128,
  adminDatabase: "master",
  databasesSql:
    "SELECT name FROM sys.databases WHERE name NOT IN ('master','tempdb','model','msdb') ORDER BY name",
  tablesSql:
    "SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
  // T-SQL has no boolean type, so `(pk.COLUMN_NAME IS NOT NULL) AS pk` is a syntax
  // error here — the CASE yields the 1/0 that `toBoolean` expects. The join alias is
  // `pkey` rather than `pk` so the only `pk` in the statement is the output column.
  columnsSql: (table) => `
    SELECT c.COLUMN_NAME AS name,
           c.DATA_TYPE AS type,
           c.IS_NULLABLE AS nullable,
           NULL AS [default],
           CASE WHEN pkey.COLUMN_NAME IS NULL THEN 0 ELSE 1 END AS pk
    FROM INFORMATION_SCHEMA.COLUMNS c
    LEFT JOIN (
      SELECT kcu.COLUMN_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      WHERE tc.TABLE_NAME = ${literal(table)} AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
    ) pkey ON pkey.COLUMN_NAME = c.COLUMN_NAME
    WHERE c.TABLE_NAME = ${literal(table)}
    ORDER BY c.ORDINAL_POSITION`,
  countSql: (table) => `SELECT COUNT(*) AS cnt FROM ${mssql.quote(table)}`,
  versionSql: "SELECT @@VERSION AS version",
  serverVersion: (raw) => raw.split("\n")[0].trim(),
  // T-SQL has no CREATE TABLE … AS SELECT; SELECT … INTO is its equivalent.
  createTableAsSql: (target, source) => `SELECT * INTO ${mssql.quote(target)} FROM ${mssql.quote(source)}`,
  insertFromSelectSql: (target, columns, source) => insertSelectSql(mssql, target, columns, source),
  pageSql: (table, page) => mssqlPageSql(mssql, table, page),
  limitSql: (sql, limit) => mssqlLimitSql(sql, limit),
  // T-SQL spells the keyword ADD, never ADD COLUMN.
  addColumnSql: (table, column) =>
    `ALTER TABLE ${mssql.quote(table)} ADD ${mssql.quote(column.name)} ${adaptTypeForDatabase(column.type, "mssql")}${column.nullable ? "" : " NOT NULL"}`,
  dropColumnSql: (table, column) => dropColumnStatement(mssql, table, column),
  // Renames go through sp_rename, which takes the current name as a literal.
  renameColumnSql: (table, from, to) =>
    `EXEC sp_rename ${literal(`${table}.${from}`)}, ${literal(to)}, 'COLUMN'`,
  // ALTER COLUMN restates the definition, so nullability travels with the type.
  changeTypeSql: (table, column, type, nullable) => [
    `ALTER TABLE ${mssql.quote(table)} ALTER COLUMN ${mssql.quote(column)} ${adaptTypeForDatabase(type, "mssql")}${nullable ? " NULL" : " NOT NULL"}`,
  ],
  renameTableSql: (table, to) => `EXEC sp_rename ${literal(table)}, ${literal(to)}`,
  registrySql: () => registryDdl(mssql),
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

/**
 * The one CREATE TABLE shape every engine shares. Columns arrive already
 * described, which is what the SQLite rebuild needs after introspection.
 */
export function createTableFromColumnsSql(
  dialect: Dialect,
  tableName: string,
  columns: GridColumn[],
  primaryKey?: string,
): string {
  const definitions = columns.map((column) => {
    const type = adaptTypeForDatabase(column.type, dialect.type)
    return `${dialect.quote(column.name)} ${type}${column.nullable ? "" : " NOT NULL"}`
  })

  const key = columns.find((column) => column.name === primaryKey)
  if (key) {
    definitions.push(`PRIMARY KEY (${dialect.quote(key.name)})`)
  } else {
    definitions.unshift(dialect.autoIdColumn)
  }

  return `CREATE TABLE ${dialect.quote(tableName)} (\n  ${definitions.join(",\n  ")}\n)`
}

/** Builds the CREATE TABLE statement for an analysed sheet. */
export function createTableSql(dialect: Dialect, tableName: string, config: TableCreationConfig): string {
  return createTableFromColumnsSql(
    dialect,
    tableName,
    config.columns.map((column) => ({ name: column.name, type: column.suggestedType, nullable: column.nullable })),
    config.primaryKey,
  )
}
