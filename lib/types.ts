/**
 * Domain types shared by the browser workflow, the API routes, and the
 * database layer. Single source of truth: nothing else in the app should
 * redeclare these shapes.
 */

export type DatabaseType = "mysql" | "postgresql" | "sqlite" | "mssql"

export const DATABASE_TYPES: DatabaseType[] = ["mysql", "postgresql", "sqlite", "mssql"]

export const DEFAULT_PORTS: Record<DatabaseType, number | undefined> = {
  mysql: 3306,
  postgresql: 5432,
  mssql: 1433,
  sqlite: undefined,
}

/** A saved, user-owned connection profile (kept in localStorage). */
export interface DatabaseConfig {
  id: string
  name: string
  type: DatabaseType
  host?: string
  port?: number
  database: string
  username?: string
  password?: string
  ssl?: boolean
  connectionString?: string
}

/** Connection details for a server before a database has been chosen. */
export type ServerOptions = Omit<DatabaseConfig, "id" | "name" | "database"> & { database?: string }

export interface ConnectionTestResult {
  success: boolean
  message: string
  details?: {
    serverVersion?: string
    databaseName?: string
    tablesCount?: number
  }
}

export interface DatabaseColumn {
  name: string
  type: string
  nullable: boolean
  isPrimaryKey: boolean
  defaultValue?: string
}

export interface DatabaseTable {
  name: string
  columns: DatabaseColumn[]
  rowCount?: number
}

/** Per-column result of analysing an Excel column. */
export interface ColumnAnalysis {
  name: string
  suggestedType: string
  nullable: boolean
  maxLength?: number
  samples: unknown[]
  uniqueValues: number
  nullCount: number
  totalCount: number
}

export interface TableCreationConfig {
  tableName: string
  columns: ColumnAnalysis[]
  primaryKey?: string
}

export interface ExcelSheet {
  name: string
  /** Header labels, one per column. */
  headers: string[]
  /** Data rows only; the header row is already stripped. */
  data: unknown[][]
}

export interface ExcelFile {
  name: string
  sheets: ExcelSheet[]
  size: number
}

export interface ParsedWorkbook {
  files: ExcelFile[]
  errors: string[]
}

/** One sheet queued for table creation. */
export type SheetInput = ExcelSheet & { fileName: string }

export interface CreatedTable {
  tableName: string
  fileName: string
  sheetName: string
  columns: string[]
  rowCount: number
}

export interface FailedTable {
  tableName: string
  fileName: string
  sheetName: string
  message: string
}

export type RunStatus = "success" | "partial" | "failed"

export interface FileResult {
  fileName: string
  status: RunStatus
  sheetsProcessed: number
  recordsProcessed: number
  processingTimeMs: number
  errors: string[]
}

export interface TableResult {
  tableName: string
  status: RunStatus
  recordsInserted: number
  recordsFailed: number
  executionTimeMs: number
  errors: string[]
}

/** Persisted record of one completed import run. */
export interface OperationResult {
  id: string
  timestamp: string
  status: RunStatus
  summary: {
    filesProcessed: number
    sheetsProcessed: number
    tablesAffected: number
    recordsProcessed: number
    executionTimeMs: number
  }
  details: {
    fileResults: FileResult[]
    tableResults: TableResult[]
    warnings: string[]
  }
  configuration: {
    databaseType: DatabaseType
    databaseName: string
    connectionName: string
  }
}
