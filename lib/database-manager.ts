import { DataTypeDetector, type TableCreationConfig } from "./data-type-detector"
import { DataCleaner, type DataCleaningOptions } from "./data-cleaner"

export interface DatabaseConfig {
  id: string
  name: string
  type: "mysql" | "postgresql" | "sqlite" | "mssql"
  host?: string
  port?: number
  database: string
  username?: string
  password?: string
  ssl?: boolean
  connectionString?: string
}

export interface ConnectionTestResult {
  success: boolean
  message: string
  details?: {
    serverVersion?: string
    databaseName?: string
    tablesCount?: number
  }
}

export interface DatabaseTable {
  name: string
  columns: DatabaseColumn[]
  rowCount?: number
}

export interface DatabaseColumn {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
  defaultValue?: string
}

export type DatabaseServerOptions = Pick<DatabaseConfig, "type" | "host" | "port" | "username" | "password" | "ssl"> & {
  database?: string
}

export class DatabaseManager {
  private static connections: Map<string, DatabaseConfig> = new Map()

  static async testConnection(config: DatabaseConfig): Promise<ConnectionTestResult> {
    // Check if we're in a browser environment
    if (typeof window !== 'undefined') {
      throw new Error('Database operations can only be performed on the server side')
    }
    
    // Basic validation
    if (!config.database) {
      return {
        success: false,
        message: "Database name is required",
      }
    }

    if (config.type !== "sqlite" && !config.host) {
      return {
        success: false,
        message: "Host is required for remote databases",
      }
    }

    if (config.type !== "sqlite" && !config.username) {
      return {
        success: false,
        message: "Username is required",
      }
    }

    try {
      switch (config.type) {
        case "postgresql":
          return await this.testPostgresConnection(config)
        case "mysql":
          return await this.testMySQLConnection(config)
        case "sqlite":
          return await this.testSQLiteConnection(config)
        case "mssql":
          return await this.testMSSQLConnection(config)
        default:
          return {
            success: false,
            message: `Unsupported database type: ${config.type}`,
          }
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Connection failed",
      }
    }
  }

  static async listDatabases(options: DatabaseServerOptions): Promise<string[]> {
    if (typeof window !== 'undefined') {
      throw new Error('Database operations can only be performed on the server side')
    }

    switch (options.type) {
      case "postgresql":
        return await this.listPostgresDatabases(options)
      case "mysql":
        return await this.listMySQLDatabases(options)
      case "sqlite":
        return []
      case "mssql":
        return await this.listMSSQLDatabases(options)
      default:
        throw new Error(`Unsupported database type: ${options.type}`)
    }
  }

  static async createDatabase(options: DatabaseServerOptions, databaseName: string): Promise<void> {
    if (typeof window !== 'undefined') {
      throw new Error('Database operations can only be performed on the server side')
    }

    if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
      throw new Error('Database name may only contain letters, numbers, and underscores')
    }

    switch (options.type) {
      case "postgresql":
        return await this.createPostgresDatabase(options, databaseName)
      case "mysql":
        return await this.createMySQLDatabase(options, databaseName)
      case "sqlite":
        throw new Error('SQLite manages databases as files; create a new file path instead.')
      case "mssql":
        return await this.createMSSQLDatabase(options, databaseName)
      default:
        throw new Error(`Unsupported database type: ${options.type}`)
    }
  }

  static async getTables(config: DatabaseConfig): Promise<DatabaseTable[]> {
    // Check if we're in a browser environment
    if (typeof window !== 'undefined') {
      throw new Error('Database operations can only be performed on the server side')
    }
    
    try {
      switch (config.type) {
        case "postgresql":
          return await this.introspectPostgres(config)
        case "mysql":
          return await this.introspectMySQL(config)
        case "sqlite":
          return await this.introspectSQLite(config)
        case "mssql":
          return await this.introspectMSSQL(config)
        default:
          return []
      }
    } catch (err) {
      console.error("getTables error", err)
      return [] // Caller can decide to show "No tables found"
    }
  }

  static saveConnection(config: DatabaseConfig): void {
    this.connections.set(config.id, config)
  }

  static getConnection(id: string): DatabaseConfig | undefined {
    return this.connections.get(id)
  }

  static getAllConnections(): DatabaseConfig[] {
    return Array.from(this.connections.values())
  }

  static removeConnection(id: string): void {
    this.connections.delete(id)
  }

  static generateConnectionString(config: DatabaseConfig): string {
    switch (config.type) {
      case "mysql":
        return `mysql://${config.username}:${config.password}@${config.host}:${config.port || 3306}/${config.database}${config.ssl ? "?ssl=true" : ""}`
      case "postgresql":
        return `postgresql://${config.username}:${config.password}@${config.host}:${config.port || 5432}/${config.database}${config.ssl ? "?sslmode=require" : ""}`
      case "sqlite":
        return `sqlite://${config.database}`
      case "mssql":
        return `mssql://${config.username}:${config.password}@${config.host}:${config.port || 1433}/${config.database}${config.ssl ? "?encrypt=true" : ""}`
      default:
        return ""
    }
  }

  private static resolveAdminDatabase(options: DatabaseServerOptions): string | undefined {
    if (options.database && options.database.trim().length > 0) {
      return options.database
    }

    switch (options.type) {
      case "postgresql":
        return "postgres"
      case "mysql":
        return undefined // MySQL connections can omit database
      case "mssql":
        return "master"
      default:
        return undefined
    }
  }

  private static async listPostgresDatabases(options: DatabaseServerOptions): Promise<string[]> {
    const { Client } = await import("pg")
    const client = new Client({
      host: options.host,
      port: options.port || 5432,
      database: this.resolveAdminDatabase(options) || "postgres",
      user: options.username,
      password: options.password,
      ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
    })

    await client.connect()
    try {
      const res = await client.query(
        "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
      )
      return res.rows.map((row: any) => row.datname as string)
    } finally {
      await client.end().catch(() => {})
    }
  }

  private static async listMySQLDatabases(options: DatabaseServerOptions): Promise<string[]> {
    const mysql = await import("mysql2/promise")
    const conn = await mysql.createConnection({
      host: options.host,
      port: options.port || 3306,
      user: options.username,
      password: options.password,
      ssl: options.ssl ? { rejectUnauthorized: false } : undefined as any,
    })

    try {
      const [rowsRaw] = await conn.query("SHOW DATABASES")
      const rows = rowsRaw as Array<Record<string, string>>
      const key = rows.length ? Object.keys(rows[0])[0] : "Database"
      return rows.map((row) => row[key])
    } finally {
      await conn.end().catch(() => {})
    }
  }

  private static async listMSSQLDatabases(options: DatabaseServerOptions): Promise<string[]> {
    const mssql = await import("mssql")
    const pool = new mssql.ConnectionPool({
      server: options.host!,
      port: options.port || 1433,
      database: this.resolveAdminDatabase(options) || "master",
      user: options.username,
      password: options.password,
      options: { encrypt: !!options.ssl, trustServerCertificate: true },
    })

    await pool.connect()
    try {
      const res = await pool
        .request()
        .query("SELECT name FROM sys.databases WHERE name NOT IN ('master','tempdb','model','msdb') ORDER BY name")
      return (res.recordset as Array<{ name: string }>).map((row) => row.name)
    } finally {
      await pool.close().catch(() => {})
    }
  }

  private static async createPostgresDatabase(options: DatabaseServerOptions, databaseName: string): Promise<void> {
    const { Client } = await import("pg")
    const client = new Client({
      host: options.host,
      port: options.port || 5432,
      database: this.resolveAdminDatabase(options) || "postgres",
      user: options.username,
      password: options.password,
      ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
    })

    await client.connect()
    try {
      await client.query(`CREATE DATABASE "${databaseName}"`)
    } finally {
      await client.end().catch(() => {})
    }
  }

  private static async createMySQLDatabase(options: DatabaseServerOptions, databaseName: string): Promise<void> {
    const mysql = await import("mysql2/promise")
    const conn = await mysql.createConnection({
      host: options.host,
      port: options.port || 3306,
      user: options.username,
      password: options.password,
      ssl: options.ssl ? { rejectUnauthorized: false } : undefined as any,
    })

    try {
      await conn.query(`CREATE DATABASE \`${databaseName}\``)
    } finally {
      await conn.end().catch(() => {})
    }
  }

  private static async createMSSQLDatabase(options: DatabaseServerOptions, databaseName: string): Promise<void> {
    const mssql = await import("mssql")
    const pool = new mssql.ConnectionPool({
      server: options.host!,
      port: options.port || 1433,
      database: this.resolveAdminDatabase(options) || "master",
      user: options.username,
      password: options.password,
      options: { encrypt: !!options.ssl, trustServerCertificate: true },
    })

    await pool.connect()
    try {
      await pool.request().query(`CREATE DATABASE [${databaseName}]`)
    } finally {
      await pool.close().catch(() => {})
    }
  }

  // --- Introspection helpers ---
  private static async introspectPostgres(config: DatabaseConfig): Promise<DatabaseTable[]> {
    const { Client } = await import("pg")
    const client = new Client(
      config.connectionString || {
        host: config.host,
        port: config.port || 5432,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      }
    )
    await client.connect()
    try {
  const tablesRes = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
      )
      const result: DatabaseTable[] = []
      for (const row of tablesRes.rows) {
        const tableName = row.table_name
        const colsRes = await client.query(
          "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
          [tableName]
        )
        const pkRes = await client.query(
          `SELECT a.attname
           FROM pg_index i
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
           WHERE i.indrelid = $1::regclass AND i.indisprimary`,
          [tableName]
        )
        const pkSet = new Set((pkRes.rows as any[]).map((r: any) => r.attname))
        let rowCount: number | undefined
        try {
          const cnt = await client.query(`SELECT COUNT(*)::text as count FROM "${tableName}"`)
          rowCount = parseInt((cnt.rows as any[])[0].count, 10)
        } catch {
          // ignore count errors (permissions, etc.)
        }
        result.push({
          name: tableName,
          columns: (colsRes.rows as any[]).map((c: any) => ({
            name: c.column_name,
            type: String(c.data_type).toUpperCase(),
            nullable: c.is_nullable === "YES",
            isPrimaryKey: pkSet.has(c.column_name),
            defaultValue: c.column_default || undefined,
          })),
          rowCount,
        })
      }
      return result
    } finally {
      await client.end().catch(() => {})
    }
  }

  private static async introspectMySQL(config: DatabaseConfig): Promise<DatabaseTable[]> {
    const mysql = await import("mysql2/promise")
    const conn = await mysql.createConnection({
      host: config.host,
      port: config.port || 3306,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined as any,
    })
    try {
  const [tablesRowsRaw] = await conn.query("SHOW TABLES")
  const tablesRows = tablesRowsRaw as any[]
  const tableNameKey = tablesRows.length ? Object.keys(tablesRows[0]).find((k) => k.toLowerCase().includes("table")) : undefined
  const tables = tablesRows.map((r: any) => r[tableNameKey || Object.keys(r)[0]]) as string[]
      const result: DatabaseTable[] = []
      for (const tableName of tables) {
  const [colsRowsRaw] = await conn.query(`SHOW COLUMNS FROM \`${tableName}\``)
  const colsRows = colsRowsRaw as any[]
  const pkSet = new Set(colsRows.filter((c: any) => c.Key === "PRI").map((c: any) => c.Field))
        let rowCount: number | undefined
        try {
          const [cntRowsRaw] = await conn.query(`SELECT COUNT(*) as cnt FROM \`${tableName}\``)
          const cntRows = cntRowsRaw as any[]
          rowCount = Number(cntRows[0].cnt)
        } catch {}
        result.push({
          name: tableName,
          columns: colsRows.map((c: any) => ({
            name: c.Field,
            type: String(c.Type).toUpperCase(),
            nullable: c.Null === "YES",
            isPrimaryKey: pkSet.has(c.Field),
            defaultValue: c.Default == null ? undefined : String(c.Default),
          })),
          rowCount,
        })
      }
      return result
    } finally {
      await conn.end().catch(() => {})
    }
  }

  private static async introspectSQLite(config: DatabaseConfig): Promise<DatabaseTable[]> {
    // Using sqlite3 (callback) wrapped into promises
    const sqlite3 = await import("sqlite3")
    const { Database } = sqlite3.default.verbose()
    const dbPath = config.database
    const db: any = await new Promise((resolve, reject) => {
      const instance = new Database(dbPath, (err: Error | null) => (err ? reject(err) : resolve(instance)))
    })

    const allAsync = (sql: string, params: any[] = []) =>
      new Promise<any[]>((resolve, reject) => {
        db.all(sql, params, (err: Error | null, rows: any[]) => (err ? reject(err) : resolve(rows)))
      })

    try {
      const tables = await allAsync(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      const result: DatabaseTable[] = []
      for (const t of tables) {
        const tableName = t.name
        const cols = await allAsync(`PRAGMA table_info(\"${tableName}\")`)
        let rowCount: number | undefined
        try {
          const cnt = await allAsync(`SELECT COUNT(*) as cnt FROM \"${tableName}\"`)
          rowCount = Number(cnt[0].cnt)
        } catch {}
        result.push({
          name: tableName,
          columns: cols.map((c) => ({
            name: c.name,
            type: (c.type as string).toUpperCase(),
            nullable: c.notnull === 0,
            isPrimaryKey: c.pk === 1,
            defaultValue: c.dflt_value || undefined,
          })),
          rowCount,
        })
      }
      return result
    } finally {
      db.close?.()
    }
  }

  private static async introspectMSSQL(config: DatabaseConfig): Promise<DatabaseTable[]> {
    const mssql = await import("mssql")
    const pool = new mssql.ConnectionPool({
      server: config.host!,
      port: config.port || 1433,
      database: config.database,
      user: config.username,
      password: config.password,
      options: { encrypt: !!config.ssl, trustServerCertificate: true },
    })
    await pool.connect()
    try {
      const tablesRes = await pool
        .request()
        .query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME")
      const tables = (tablesRes.recordset as any[]).map((r) => r.TABLE_NAME as string)
      const result: DatabaseTable[] = []
      for (const tableName of tables) {
        const colsRes = await pool
          .request()
          .input("tableName", (mssql as any).VarChar, tableName)
          .query(`SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_NAME=@tableName ORDER BY ORDINAL_POSITION`)
        const pkRes = await pool
          .request()
          .input("tableName", (mssql as any).VarChar, tableName)
          .query(`SELECT k.COLUMN_NAME
             FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
             JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE k ON tc.CONSTRAINT_NAME = k.CONSTRAINT_NAME
             WHERE tc.TABLE_NAME=@tableName AND tc.CONSTRAINT_TYPE='PRIMARY KEY'`)
        const pkSet = new Set((pkRes.recordset as any[]).map((r) => r.COLUMN_NAME))
        let rowCount: number | undefined
        try {
          const cntRes = await pool.request().query(`SELECT COUNT(*) as cnt FROM [${tableName}]`)
          rowCount = Number((cntRes.recordset as any[])[0].cnt)
        } catch {}
        result.push({
          name: tableName,
          columns: (colsRes.recordset as any[]).map((c) => ({
            name: c.COLUMN_NAME,
            type: (c.DATA_TYPE as string).toUpperCase(),
            nullable: c.IS_NULLABLE === "YES",
            isPrimaryKey: pkSet.has(c.COLUMN_NAME),
          })),
          rowCount,
        })
      }
      return result
    } finally {
      await pool.close().catch(() => {})
    }
  }

  // --- Connection Testing helpers ---
  private static async testPostgresConnection(config: DatabaseConfig): Promise<ConnectionTestResult> {
    const { Client } = await import("pg")
    const client = new Client(
      config.connectionString || {
        host: config.host,
        port: config.port || 5432,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      }
    )

    try {
      await client.connect()
      
      // Get server version
      const versionRes = await client.query("SELECT version()")
      const version = versionRes.rows[0]?.version || "Unknown"
      
      // Count tables
      const tablesRes = await client.query(
        "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"
      )
      const tablesCount = parseInt((tablesRes.rows[0] as any).count, 10)

      return {
        success: true,
        message: "Connection successful",
        details: {
          serverVersion: version.split(" ")[1] || "PostgreSQL",
          databaseName: config.database,
          tablesCount,
        },
      }
    } finally {
      await client.end().catch(() => {})
    }
  }

  private static async testMySQLConnection(config: DatabaseConfig): Promise<ConnectionTestResult> {
    const mysql = await import("mysql2/promise")
    const conn = await mysql.createConnection({
      host: config.host,
      port: config.port || 3306,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined as any,
    })

    try {
      // Get server version
      const [versionRows] = await conn.query("SELECT VERSION() as version")
      const version = (versionRows as any[])[0]?.version || "Unknown"
      
      // Count tables
      const [tablesRows] = await conn.query("SHOW TABLES")
      const tablesCount = (tablesRows as any[]).length

      return {
        success: true,
        message: "Connection successful",
        details: {
          serverVersion: version,
          databaseName: config.database,
          tablesCount,
        },
      }
    } finally {
      await conn.end().catch(() => {})
    }
  }

  private static async testSQLiteConnection(config: DatabaseConfig): Promise<ConnectionTestResult> {
    const sqlite3 = await import("sqlite3")
    const { Database } = sqlite3.default.verbose()
    const dbPath = config.database

    const db: any = await new Promise((resolve, reject) => {
      const instance = new Database(dbPath, (err: Error | null) => (err ? reject(err) : resolve(instance)))
    })

    const allAsync = (sql: string, params: any[] = []) =>
      new Promise<any[]>((resolve, reject) => {
        db.all(sql, params, (err: Error | null, rows: any[]) => (err ? reject(err) : resolve(rows)))
      })

    try {
      // Get SQLite version
      const versionRows = await allAsync("SELECT sqlite_version() as version")
      const version = versionRows[0]?.version || "Unknown"
      
      // Count tables
      const tables = await allAsync(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      const tablesCount = tables[0]?.count || 0

      return {
        success: true,
        message: "Connection successful",
        details: {
          serverVersion: `SQLite ${version}`,
          databaseName: config.database,
          tablesCount,
        },
      }
    } finally {
      db.close?.()
    }
  }

  private static async testMSSQLConnection(config: DatabaseConfig): Promise<ConnectionTestResult> {
    const mssql = await import("mssql")
    const pool = new mssql.ConnectionPool({
      server: config.host!,
      port: config.port || 1433,
      database: config.database,
      user: config.username,
      password: config.password,
      options: { encrypt: !!config.ssl, trustServerCertificate: true },
    })

    try {
      await pool.connect()
      
      // Get server version
      const versionRes = await pool.request().query("SELECT @@VERSION as version")
      const version = (versionRes.recordset as any[])[0]?.version || "Unknown"
      
      // Count tables
      const tablesRes = await pool.request().query(
        "SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'"
      )
      const tablesCount = (tablesRes.recordset as any[])[0]?.count || 0

      return {
        success: true,
        message: "Connection successful",
        details: {
          serverVersion: version.split("\n")[0]?.trim() || "Microsoft SQL Server",
          databaseName: config.database,
          tablesCount,
        },
      }
    } finally {
      await pool.close().catch(() => {})
    }
  }

  // --- Table Creation and Data Insertion ---
  static async createTable(config: DatabaseConfig, tableConfig: TableCreationConfig): Promise<void> {
    if (typeof window !== 'undefined') {
      throw new Error('Database operations can only be performed on the server side')
    }

    switch (config.type) {
      case "postgresql":
        return await this.createPostgresTable(config, tableConfig)
      case "mysql":
        return await this.createMySQLTable(config, tableConfig)
      case "sqlite":
        return await this.createSQLiteTable(config, tableConfig)
      case "mssql":
        return await this.createMSSQLTable(config, tableConfig)
      default:
        throw new Error(`Unsupported database type: ${config.type}`)
    }
  }

  /**
   * Insert data with advanced cleaning and null handling
   */
  static async insertDataWithCleaning(
    config: DatabaseConfig, 
    tableName: string, 
    data: any[][], 
    columnNames?: string[],
    cleaningOptions: DataCleaningOptions = { handleNulls: 'default' }
  ): Promise<{insertedRows: number, skippedRows: number, warnings: string[]}> {
    console.log('=== DATABASE MANAGER INSERT WITH CLEANING ===')
    console.log('Database type:', config.type)
    console.log('Table name:', tableName)
    console.log('Data rows:', data.length)
    console.log('Cleaning options:', cleaningOptions)

    if (data.length === 0) {
      console.log('No data to insert, returning 0 rows')
      return { insertedRows: 0, skippedRows: 0, warnings: [] }
    }

    // Get column metadata from database (simplified - in practice you'd fetch this)
    const headers = columnNames || data[0]
    const dataRows = columnNames ? data : data.slice(1)

    // Clean the data
    const { cleanedData, skippedRows, warnings } = DataCleaner.cleanData(
      dataRows,
      headers,
      cleaningOptions
    )

    console.log(`Cleaned data: ${cleanedData.length} rows, skipped: ${skippedRows.length} rows`)
    if (warnings.length > 0) {
      console.log('Data cleaning warnings:', warnings)
    }

    // Insert the cleaned data using the existing method
    const insertResult = await this.insertData(config, tableName, cleanedData, headers)

    return {
      insertedRows: insertResult.insertedRows,
      skippedRows: skippedRows.length,
      warnings
    }
  }

  static async insertData(config: DatabaseConfig, tableName: string, data: any[][], columnNames?: string[]): Promise<{insertedRows: number}> {
    if (typeof window !== 'undefined') {
      throw new Error('Database operations can only be performed on the server side')
    }

    console.log('=== DATABASE MANAGER INSERT DEBUG ===')
    console.log('Database type:', config.type)
    console.log('Table name:', tableName)
    console.log('Data rows:', data.length)
    console.log('Column names provided:', columnNames)
    console.log('First row sample:', data[0])

    if (data.length === 0) {
      console.log('No data to insert, returning 0 rows')
      return { insertedRows: 0 }
    }

    try {
      let result
      switch (config.type) {
        case "postgresql":
          result = await this.insertPostgresData(config, tableName, data, columnNames)
          break
        case "mysql":
          result = await this.insertMySQLData(config, tableName, data, columnNames)
          break
        case "sqlite":
          result = await this.insertSQLiteData(config, tableName, data, columnNames)
          break
        case "mssql":
          result = await this.insertMSSQLData(config, tableName, data, columnNames)
          break
        default:
          throw new Error(`Unsupported database type: ${config.type}`)
      }
      
      console.log(`✅ Database Manager: Successfully inserted ${result.insertedRows} rows`)
      return result
    } catch (error) {
      console.error('❌ Database Manager Insert Error:', error)
      throw error
    }
  }

  // PostgreSQL table creation and data insertion
  private static async createPostgresTable(config: DatabaseConfig, tableConfig: TableCreationConfig): Promise<void> {
    const { Client } = await import("pg")
    const client = new Client(
      config.connectionString || {
        host: config.host,
        port: config.port || 5432,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      }
    )

    await client.connect()
    try {
      await client.query('BEGIN')
      
      const columns = tableConfig.columns.map(col => {
        const dbType = DataTypeDetector.adaptTypeForDatabase(col.suggestedType, 'postgresql')
        const nullable = col.nullable ? '' : ' NOT NULL'
        return `"${col.name}" ${dbType}${nullable}`
      }).join(', ')

      // Add ID column if no primary key specified or if it doesn't exist
      const hasPrimaryKey = tableConfig.columns.some(col => col.name === tableConfig.primaryKey)
      const idColumn = !hasPrimaryKey ? 'id SERIAL PRIMARY KEY, ' : ''
      
      const primaryKeyClause = hasPrimaryKey ? `, PRIMARY KEY ("${tableConfig.primaryKey}")` : ''
      
      const createTableSQL = `
        CREATE TABLE "${tableConfig.tableName}" (
          ${idColumn}${columns}${primaryKeyClause}
        )
      `
      
      await client.query(createTableSQL)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      await client.end().catch(() => {})
    }
  }

  private static async insertPostgresData(config: DatabaseConfig, tableName: string, data: any[][], columnNames?: string[]): Promise<{insertedRows: number}> {
    console.log('=== POSTGRES INSERT DEBUG ===')
    
    const { Client } = await import("pg")
    const client = new Client(
      config.connectionString || {
        host: config.host,
        port: config.port || 5432,
        database: config.database,
        user: config.username,
        password: config.password,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      }
    )

    await client.connect()
    try {
      await client.query('BEGIN')
      
      // Use provided column names or assume first row contains headers
      let headers: string[]
      let rows: any[][]
      
      if (columnNames) {
        headers = columnNames
        rows = data // All data is actual rows
        console.log('Using provided column names:', headers)
      } else {
        headers = data[0]
        rows = data.slice(1)
        console.log('Using first row as headers:', headers)
      }
      
      console.log('Headers for SQL:', headers)
      console.log('Rows to insert:', rows.length)
      console.log('First row sample:', rows[0])
      
      const columnNamesSQL = headers.map(h => `"${h}"`).join(', ')
      const placeholders = headers.map((_, i) => `$${i + 1}`).join(', ')
      
      const insertSQL = `INSERT INTO "${tableName}" (${columnNamesSQL}) VALUES (${placeholders})`
      console.log('Generated SQL:', insertSQL)
      
      let insertedRows = 0
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        if (row.some(cell => cell !== null && cell !== undefined && cell !== '')) {
          console.log(`Inserting row ${i + 1}:`, row)
          
          // Handle null values - convert null to empty string or default values for NOT NULL columns
          const processedRow = row.map((cell, cellIndex) => {
            if (cell === null || cell === undefined) {
              // For now, convert null to empty string for text columns
              // In a production system, you'd want to check column metadata
              console.log(`⚠️ Null value detected in column ${headers[cellIndex]}, converting to empty string`)
              return ''
            }
            return cell
          })
          
          try {
            await client.query(insertSQL, processedRow)
            insertedRows++
            console.log(`✅ Row ${i + 1} inserted successfully`)
          } catch (rowError) {
            console.error(`❌ Error inserting row ${i + 1}:`, rowError)
            console.error('Original row data:', row)
            console.error('Processed row data:', processedRow)
            
            // Check if it's a NOT NULL constraint violation
            const error = rowError as any
            if (error.code === '23502') { // PostgreSQL NOT NULL constraint violation
              console.error(`🚫 NOT NULL constraint violation in column: ${error.column}`)
              console.error('Skipping this row and continuing with next row...')
              continue // Skip this row and continue with the next one
            }
            
            throw rowError
          }
        } else {
          console.log(`Skipping empty row ${i + 1}:`, row)
        }
      }
      
      await client.query('COMMIT')
      console.log(`✅ PostgreSQL: Successfully inserted ${insertedRows} rows`)
      return { insertedRows }
    } catch (error) {
      console.error('❌ PostgreSQL Insert Error:', error)
      await client.query('ROLLBACK')
      throw error
    } finally {
      await client.end().catch(() => {})
    }
  }

  // MySQL table creation and data insertion
  private static async createMySQLTable(config: DatabaseConfig, tableConfig: TableCreationConfig): Promise<void> {
    const mysql = await import("mysql2/promise")
    const conn = await mysql.createConnection({
      host: config.host,
      port: config.port || 3306,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined as any,
    })

    try {
      await conn.beginTransaction()
      
      const columns = tableConfig.columns.map(col => {
        const dbType = DataTypeDetector.adaptTypeForDatabase(col.suggestedType, 'mysql')
        const nullable = col.nullable ? '' : ' NOT NULL'
        return `\`${col.name}\` ${dbType}${nullable}`
      }).join(', ')

      const hasPrimaryKey = tableConfig.columns.some(col => col.name === tableConfig.primaryKey)
      const idColumn = !hasPrimaryKey ? 'id INT AUTO_INCREMENT PRIMARY KEY, ' : ''
      const primaryKeyClause = hasPrimaryKey ? `, PRIMARY KEY (\`${tableConfig.primaryKey}\`)` : ''
      
      const createTableSQL = `
        CREATE TABLE \`${tableConfig.tableName}\` (
          ${idColumn}${columns}${primaryKeyClause}
        )
      `
      
      await conn.execute(createTableSQL)
      await conn.commit()
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      await conn.end().catch(() => {})
    }
  }

  private static async insertMySQLData(config: DatabaseConfig, tableName: string, data: any[][], columnNames?: string[]): Promise<{insertedRows: number}> {
    const mysql = await import("mysql2/promise")
    const conn = await mysql.createConnection({
      host: config.host,
      port: config.port || 3306,
      user: config.username,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined as any,
    })

    try {
      await conn.beginTransaction()
      
      // Use provided column names or assume first row contains headers
      let headers: string[]
      let rows: any[][]
      
      if (columnNames) {
        headers = columnNames
        rows = data // All data is actual rows
      } else {
        headers = data[0]
        rows = data.slice(1)
      }
      
      const columnNamesSQL = headers.map(h => `\`${h}\``).join(', ')
      const placeholders = headers.map(() => '?').join(', ')
      
      const insertSQL = `INSERT INTO \`${tableName}\` (${columnNamesSQL}) VALUES (${placeholders})`
      
      let insertedRows = 0
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        if (row.some(cell => cell !== null && cell !== undefined && cell !== '')) {
          console.log(`🐬 [MySQL] Inserting row ${i + 1}:`, row)
          
          // Handle null values - convert null to empty string for NOT NULL columns
          const processedRow = row.map((cell, cellIndex) => {
            if (cell === null || cell === undefined) {
              console.log(`⚠️ [MySQL] Null value detected in column ${headers[cellIndex]}, converting to empty string`)
              return ''
            }
            return cell
          })
          
          try {
            await conn.execute(insertSQL, processedRow)
            insertedRows++
            console.log(`✅ [MySQL] Row ${i + 1} inserted successfully`)
          } catch (rowError) {
            console.error(`❌ [MySQL] Error inserting row ${i + 1}:`, rowError)
            console.error('Original row data:', row)
            console.error('Processed row data:', processedRow)
            
            // Check if it's a constraint violation and skip the row
            const error = rowError as any
            if (error.code === 'ER_BAD_NULL_ERROR' || error.errno === 1048) { // MySQL NOT NULL constraint violation
              console.error(`🚫 [MySQL] NOT NULL constraint violation, skipping row ${i + 1}`)
              continue
            }
            
            throw rowError
          }
        }
      }
      
      await conn.commit()
      return { insertedRows }
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      await conn.end().catch(() => {})
    }
  }

  // SQLite table creation and data insertion
  private static async createSQLiteTable(config: DatabaseConfig, tableConfig: TableCreationConfig): Promise<void> {
    const sqlite3 = await import("sqlite3")
    const { Database } = sqlite3.default.verbose()
    const dbPath = config.database

    const db: any = await new Promise((resolve, reject) => {
      const instance = new Database(dbPath, (err: Error | null) => (err ? reject(err) : resolve(instance)))
    })

    const runAsync = (sql: string, params: any[] = []) =>
      new Promise<void>((resolve, reject) => {
        db.run(sql, params, (err: Error | null) => (err ? reject(err) : resolve()))
      })

    try {
      await runAsync('BEGIN TRANSACTION')
      
      const columns = tableConfig.columns.map(col => {
        const dbType = DataTypeDetector.adaptTypeForDatabase(col.suggestedType, 'sqlite')
        const nullable = col.nullable ? '' : ' NOT NULL'
        return `"${col.name}" ${dbType}${nullable}`
      }).join(', ')

      const hasPrimaryKey = tableConfig.columns.some(col => col.name === tableConfig.primaryKey)
      const idColumn = !hasPrimaryKey ? 'id INTEGER PRIMARY KEY AUTOINCREMENT, ' : ''
      const primaryKeyClause = hasPrimaryKey ? `, PRIMARY KEY ("${tableConfig.primaryKey}")` : ''
      
      const createTableSQL = `
        CREATE TABLE "${tableConfig.tableName}" (
          ${idColumn}${columns}${primaryKeyClause}
        )
      `
      
      await runAsync(createTableSQL)
      await runAsync('COMMIT')
    } catch (error) {
      await runAsync('ROLLBACK')
      throw error
    } finally {
      db.close?.()
    }
  }

  private static async insertSQLiteData(config: DatabaseConfig, tableName: string, data: any[][], columnNames?: string[]): Promise<{insertedRows: number}> {
    const sqlite3 = await import("sqlite3")
    const { Database } = sqlite3.default.verbose()
    const dbPath = config.database

    const db: any = await new Promise((resolve, reject) => {
      const instance = new Database(dbPath, (err: Error | null) => (err ? reject(err) : resolve(instance)))
    })

    const runAsync = (sql: string, params: any[] = []) =>
      new Promise<void>((resolve, reject) => {
        db.run(sql, params, (err: Error | null) => (err ? reject(err) : resolve()))
      })

    try {
      await runAsync('BEGIN TRANSACTION')
      
      // Use provided column names or assume first row contains headers
      let headers: string[]
      let rows: any[][]
      
      if (columnNames) {
        headers = columnNames
        rows = data // All data is actual rows
      } else {
        headers = data[0]
        rows = data.slice(1)
      }
      
      const columnNamesSQL = headers.map(h => `"${h}"`).join(', ')
      const placeholders = headers.map(() => '?').join(', ')
      
      const insertSQL = `INSERT INTO "${tableName}" (${columnNamesSQL}) VALUES (${placeholders})`
      
      let insertedRows = 0
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        if (row.some(cell => cell !== null && cell !== undefined && cell !== '')) {
          console.log(`💾 [SQLite] Inserting row ${i + 1}:`, row)
          
          // Handle null values - convert null to empty string for NOT NULL columns
          const processedRow = row.map((cell, cellIndex) => {
            if (cell === null || cell === undefined) {
              console.log(`⚠️ [SQLite] Null value detected in column ${headers[cellIndex]}, converting to empty string`)
              return ''
            }
            return cell
          })
          
          try {
            await runAsync(insertSQL, processedRow)
            insertedRows++
            console.log(`✅ [SQLite] Row ${i + 1} inserted successfully`)
          } catch (rowError) {
            console.error(`❌ [SQLite] Error inserting row ${i + 1}:`, rowError)
            console.error('Original row data:', row)
            console.error('Processed row data:', processedRow)
            
            // Check if it's a constraint violation and skip the row
            const error = rowError as any
            if (error.message && error.message.includes('NOT NULL constraint failed')) {
              console.error(`🚫 [SQLite] NOT NULL constraint violation, skipping row ${i + 1}`)
              continue
            }
            
            throw rowError
          }
        }
      }
      
      await runAsync('COMMIT')
      return { insertedRows }
    } catch (error) {
      await runAsync('ROLLBACK')
      throw error
    } finally {
      db.close?.()
    }
  }

  // MSSQL table creation and data insertion
  private static async createMSSQLTable(config: DatabaseConfig, tableConfig: TableCreationConfig): Promise<void> {
    const mssql = await import("mssql")
    const pool = new mssql.ConnectionPool({
      server: config.host!,
      port: config.port || 1433,
      database: config.database,
      user: config.username,
      password: config.password,
      options: { encrypt: !!config.ssl, trustServerCertificate: true },
    })

    await pool.connect()
    try {
      const transaction = new mssql.Transaction(pool)
      await transaction.begin()
      
      const columns = tableConfig.columns.map(col => {
        const dbType = DataTypeDetector.adaptTypeForDatabase(col.suggestedType, 'mssql')
        const nullable = col.nullable ? '' : ' NOT NULL'
        return `[${col.name}] ${dbType}${nullable}`
      }).join(', ')

      const hasPrimaryKey = tableConfig.columns.some(col => col.name === tableConfig.primaryKey)
      const idColumn = !hasPrimaryKey ? 'id INT IDENTITY(1,1) PRIMARY KEY, ' : ''
      const primaryKeyClause = hasPrimaryKey ? `, PRIMARY KEY ([${tableConfig.primaryKey}])` : ''
      
      const createTableSQL = `
        CREATE TABLE [${tableConfig.tableName}] (
          ${idColumn}${columns}${primaryKeyClause}
        )
      `
      
      const request = new mssql.Request(transaction)
      await request.query(createTableSQL)
      await transaction.commit()
    } catch (error) {
      throw error
    } finally {
      await pool.close().catch(() => {})
    }
  }

  private static async insertMSSQLData(config: DatabaseConfig, tableName: string, data: any[][], columnNames?: string[]): Promise<{insertedRows: number}> {
    const mssql = await import("mssql")
    const pool = new mssql.ConnectionPool({
      server: config.host!,
      port: config.port || 1433,
      database: config.database,
      user: config.username,
      password: config.password,
      options: { encrypt: !!config.ssl, trustServerCertificate: true },
    })

    await pool.connect()
    try {
      const transaction = new mssql.Transaction(pool)
      await transaction.begin()
      
      // Use provided column names or assume first row contains headers
      let headers: string[]
      let rows: any[][]
      
      if (columnNames) {
        headers = columnNames
        rows = data // All data is actual rows
      } else {
        headers = data[0]
        rows = data.slice(1)
      }
      
      const columnNamesSQL = headers.map(h => `[${h}]`).join(', ')
      const placeholders = headers.map((_, i) => `@param${i}`).join(', ')
      
      const insertSQL = `INSERT INTO [${tableName}] (${columnNamesSQL}) VALUES (${placeholders})`
      
      let insertedRows = 0
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        if (row.some(cell => cell !== null && cell !== undefined && cell !== '')) {
          console.log(`🔷 [MSSQL] Inserting row ${i + 1}:`, row)
          
          // Handle null values - convert null to empty string for NOT NULL columns
          const processedRow = row.map((cell, cellIndex) => {
            if (cell === null || cell === undefined) {
              console.log(`⚠️ [MSSQL] Null value detected in column ${headers[cellIndex]}, converting to empty string`)
              return ''
            }
            return cell
          })
          
          try {
            const request = new mssql.Request(transaction)
            processedRow.forEach((value, i) => {
              request.input(`param${i}`, value)
            })
            await request.query(insertSQL)
            insertedRows++
            console.log(`✅ [MSSQL] Row ${i + 1} inserted successfully`)
          } catch (rowError) {
            console.error(`❌ [MSSQL] Error inserting row ${i + 1}:`, rowError)
            console.error('Original row data:', row)
            console.error('Processed row data:', processedRow)
            
            // Check if it's a constraint violation and skip the row
            const error = rowError as any
            if (error.number === 515) { // MSSQL NOT NULL constraint violation
              console.error(`🚫 [MSSQL] NOT NULL constraint violation, skipping row ${i + 1}`)
              continue
            }
            
            throw rowError
          }
        }
      }
      
      await transaction.commit()
      return { insertedRows }
    } catch (error) {
      throw error
    } finally {
      await pool.close().catch(() => {})
    }
  }

  static async previewTable(config: DatabaseConfig, tableName: string, limit: number = 100): Promise<{ columns: string[], data: any[][] }> {
    console.log('🔍 [DatabaseManager.previewTable] Starting table preview', { tableName, limit, dbType: config.type })
    
    switch (config.type) {
      case 'postgresql':
        return this.previewPostgresTable(config, tableName, limit)
      case 'mysql':
        return this.previewMySQLTable(config, tableName, limit)
      case 'sqlite':
        return this.previewSQLiteTable(config, tableName, limit)
      case 'mssql':
        return this.previewMSSQLTable(config, tableName, limit)
      default:
        throw new Error(`Unsupported database type: ${config.type}`)
    }
  }

  private static async previewPostgresTable(config: DatabaseConfig, tableName: string, limit: number): Promise<{ columns: string[], data: any[][] }> {
    console.log('🐘 [DatabaseManager.previewPostgresTable] Starting PostgreSQL table preview', { tableName, limit })
    
    const { Client } = await import('pg')
    const client = new Client({
      host: config.host,
      port: config.port || 5432,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
    })

    try {
      await client.connect()
      console.log('🐘 [DatabaseManager.previewPostgresTable] Connected to PostgreSQL')

      // Get column information
      const columnsQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 
        ORDER BY ordinal_position
      `
      const columnsResult = await client.query(columnsQuery, [tableName])
      const columns = columnsResult.rows.map(row => row.column_name)
      console.log('🐘 [DatabaseManager.previewPostgresTable] Retrieved columns', { columns })

      // Get data preview
      const dataQuery = `SELECT * FROM "${tableName}" LIMIT $1`
      const dataResult = await client.query(dataQuery, [limit])
      const data = dataResult.rows.map(row => columns.map(col => row[col]))
      
      console.log('🐘 [DatabaseManager.previewPostgresTable] Retrieved data', { rowCount: data.length })
      return { columns, data }
    } catch (error) {
      console.error('🐘 [DatabaseManager.previewPostgresTable] Error:', error)
      throw error
    } finally {
      await client.end()
    }
  }

  private static async previewMySQLTable(config: DatabaseConfig, tableName: string, limit: number): Promise<{ columns: string[], data: any[][] }> {
    console.log('🐬 [DatabaseManager.previewMySQLTable] Starting MySQL table preview', { tableName, limit })
    
    const mysql = await import('mysql2/promise')
    const connectionConfig: any = {
      host: config.host,
      port: config.port || 3306,
      database: config.database,
      user: config.username,
      password: config.password,
    }
    
    if (config.ssl) {
      connectionConfig.ssl = {}
    }
    
    const connection = await mysql.createConnection(connectionConfig)

    try {
      console.log('🐬 [DatabaseManager.previewMySQLTable] Connected to MySQL')

      // Get column information
      const [columnsResult] = await connection.execute(
        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? AND TABLE_SCHEMA = ? ORDER BY ORDINAL_POSITION',
        [tableName, config.database]
      ) as any[]
      const columns = columnsResult.map((row: any) => row.COLUMN_NAME)
      console.log('🐬 [DatabaseManager.previewMySQLTable] Retrieved columns', { columns })

      // Get data preview
      const [dataResult] = await connection.execute(`SELECT * FROM \`${tableName}\` LIMIT ?`, [limit]) as any[]
      const data = dataResult.map((row: any) => columns.map((col: string) => row[col]))
      
      console.log('🐬 [DatabaseManager.previewMySQLTable] Retrieved data', { rowCount: data.length })
      return { columns, data }
    } catch (error) {
      console.error('🐬 [DatabaseManager.previewMySQLTable] Error:', error)
      throw error
    } finally {
      await connection.end()
    }
  }

  private static async previewSQLiteTable(config: DatabaseConfig, tableName: string, limit: number): Promise<{ columns: string[], data: any[][] }> {
    console.log('💾 [DatabaseManager.previewSQLiteTable] Starting SQLite table preview', { tableName, limit })
    
    const sqlite3 = await import('sqlite3')
    const { Database } = sqlite3
    
    return new Promise((resolve, reject) => {
      const db = new Database(config.database!, (err) => {
        if (err) {
          console.error('💾 [DatabaseManager.previewSQLiteTable] Connection error:', err)
          reject(err)
          return
        }
        console.log('💾 [DatabaseManager.previewSQLiteTable] Connected to SQLite')
      })

      // Get column information
      db.all(`PRAGMA table_info("${tableName}")`, (err, rows: any[]) => {
        if (err) {
          console.error('💾 [DatabaseManager.previewSQLiteTable] Error getting columns:', err)
          db.close()
          reject(err)
          return
        }

        const columns = rows.map(row => row.name)
        console.log('💾 [DatabaseManager.previewSQLiteTable] Retrieved columns', { columns })

        // Get data preview
        db.all(`SELECT * FROM "${tableName}" LIMIT ?`, [limit], (err, dataRows: any[]) => {
          if (err) {
            console.error('💾 [DatabaseManager.previewSQLiteTable] Error getting data:', err)
            db.close()
            reject(err)
            return
          }

          const data = dataRows.map(row => columns.map(col => row[col]))
          console.log('💾 [DatabaseManager.previewSQLiteTable] Retrieved data', { rowCount: data.length })
          
          db.close()
          resolve({ columns, data })
        })
      })
    })
  }

  private static async previewMSSQLTable(config: DatabaseConfig, tableName: string, limit: number): Promise<{ columns: string[], data: any[][] }> {
    console.log('🔷 [DatabaseManager.previewMSSQLTable] Starting MSSQL table preview', { tableName, limit })
    
    const mssql = await import("mssql")
    const pool = new mssql.ConnectionPool({
      server: config.host!,
      port: config.port || 1433,
      database: config.database,
      user: config.username,
      password: config.password,
      options: { encrypt: !!config.ssl, trustServerCertificate: true },
    })

    try {
      await pool.connect()
      console.log('🔷 [DatabaseManager.previewMSSQLTable] Connected to MSSQL')

      // Get column information
      const columnsQuery = `
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = @tableName 
        ORDER BY ORDINAL_POSITION
      `
      const columnsRequest = new mssql.Request(pool)
      columnsRequest.input('tableName', mssql.NVarChar, tableName)
      const columnsResult = await columnsRequest.query(columnsQuery)
      const columns = columnsResult.recordset.map(row => row.COLUMN_NAME)
      console.log('🔷 [DatabaseManager.previewMSSQLTable] Retrieved columns', { columns })

      // Get data preview
      const dataQuery = `SELECT TOP (@limit) * FROM [${tableName}]`
      const dataRequest = new mssql.Request(pool)
      dataRequest.input('limit', mssql.Int, limit)
      const dataResult = await dataRequest.query(dataQuery)
      const data = dataResult.recordset.map(row => columns.map(col => row[col]))
      
      console.log('🔷 [DatabaseManager.previewMSSQLTable] Retrieved data', { rowCount: data.length })
      return { columns, data }
    } catch (error) {
      console.error('🔷 [DatabaseManager.previewMSSQLTable] Error:', error)
      throw error
    } finally {
      await pool.close().catch(() => {})
    }
  }
}
