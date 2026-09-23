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
  /** Set by the UI the last time the connection was opened successfully. */
  lastUsedAt?: string
  /** Pinned connections sort to the top of the picker. */
  favorite?: boolean
  /** Optional free-text grouping label. */
  group?: string
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

/* ---------------------------------------------------------------------------
 * Grids
 *
 * A `Grid` is the one tabular shape that flows between a parsed sheet, a saved
 * dataset, an editable table in the browser, and a database table. Column order
 * is positional: `row[i]` always belongs to `columns[i]`.
 * ------------------------------------------------------------------------- */

export interface GridColumn {
  name: string
  /** Semantic type (`VARCHAR(100)`, `DATE`, …), never an engine-specific one. */
  type: string
  nullable: boolean
  isPrimaryKey?: boolean
  defaultValue?: string
}

export interface Grid {
  columns: GridColumn[]
  rows: unknown[][]
}

/* ---------------------------------------------------------------------------
 * Data operations
 *
 * An operation is a pure, serialisable description of one change. A dataset is
 * always `base grid + ordered operations`, so rolling back is truncating the
 * list and replaying — there is no state to drift out of sync.
 * ------------------------------------------------------------------------- */

export type FillStrategy = "value" | "mean" | "median" | "mode" | "forward" | "backward"

export type DataOperation =
  | { kind: "filter"; expression: string }
  | { kind: "derive"; column: string; type: string; expression: string }
  | { kind: "rename"; from: string; to: string }
  | { kind: "drop"; columns: string[] }
  | { kind: "keep"; columns: string[] }
  | { kind: "reorder"; columns: string[] }
  | { kind: "cast"; column: string; type: string }
  | { kind: "fill"; column: string; strategy: FillStrategy; value?: string }
  | { kind: "dedupe"; columns: string[] }
  | { kind: "sort"; column: string; direction: SortDirection }
  | { kind: "trim"; columns: string[] }
  | { kind: "replace"; column: string; find: string; replacement: string; regex: boolean }
  | { kind: "limit"; count: number }

export type OperationKind = DataOperation["kind"]

export type SortDirection = "asc" | "desc"

/** What one operation did, measured rather than estimated. */
export interface OperationEffect {
  rowsIn: number
  rowsOut: number
  cellsChanged: number
  columnsIn: number
  columnsOut: number
}

export interface OperationEntry {
  id: string
  operation: DataOperation
  createdAt: string
  /** Human sentence describing the operation, generated from its payload. */
  summary: string
  effect: OperationEffect
}

/* ---------------------------------------------------------------------------
 * Validation rules
 * ------------------------------------------------------------------------- */

export type ValidationSeverity = "error" | "warning"

export type ValidationRule =
  | { id: string; column: string; severity: ValidationSeverity; kind: "notNull" }
  | { id: string; column: string; severity: ValidationSeverity; kind: "unique" }
  | { id: string; column: string; severity: ValidationSeverity; kind: "range"; min?: number; max?: number }
  | { id: string; column: string; severity: ValidationSeverity; kind: "pattern"; pattern: string }
  | { id: string; column: string; severity: ValidationSeverity; kind: "expression"; expression: string }
  | { id: string; column: string; severity: ValidationSeverity; kind: "length"; minLength?: number; maxLength?: number }
  | { id: string; column: string; severity: ValidationSeverity; kind: "type"; type: string }

export interface ValidationFinding {
  ruleId: string
  column: string
  /** Zero-based index into the grid the rule ran against. */
  row: number
  severity: ValidationSeverity
  message: string
  value: unknown
}

/** A reusable, named set of rules the user can apply to any dataset. */
export interface ValidationProfile {
  id: string
  name: string
  rules: ValidationRule[]
  createdAt: string
}

/* ---------------------------------------------------------------------------
 * Datasets
 * ------------------------------------------------------------------------- */

export interface Dataset {
  id: string
  name: string
  sourceFile: string
  sheetName: string
  /** The parsed grid, before any operation is applied. */
  base: Grid
  operations: OperationEntry[]
  createdAt: string
  updatedAt: string
}

/** Dataset without its rows, for lists and dashboards. */
export interface DatasetSummary {
  id: string
  name: string
  sourceFile: string
  sheetName: string
  rowCount: number
  columnCount: number
  operationCount: number
  bytes: number
  createdAt: string
  updatedAt: string
}

/* ---------------------------------------------------------------------------
 * Database-side introspection and mutation
 * ------------------------------------------------------------------------- */

/** A snapshot is a real table holding a copy of another table's rows. */
export interface TableSnapshot {
  /** The storage table created for this snapshot. */
  name: string
  /** The table it was taken from. */
  table: string
  rowCount: number
  createdAt: string
}

export type AlterAction =
  | { action: "add-column"; column: GridColumn }
  | { action: "drop-column"; column: string }
  | { action: "rename-column"; from: string; to: string }
  | { action: "change-type"; column: string; type: string; nullable: boolean }
  | { action: "rename-table"; to: string }

/** Which rows a mutation targets. `primaryKey` values are matched with `IN`. */
export interface RowTarget {
  primaryKey: string
  keys: unknown[]
}

export interface RowMutation {
  action: "update" | "delete" | "insert"
  /** update: one `{ column: value }` per key. insert: rows keyed by column name. */
  records?: Array<Record<string, unknown>>
  target?: RowTarget
}

export interface QueryResult {
  columns: string[]
  data: unknown[][]
  /** True when the engine returned more rows than the requested cap. */
  truncated: boolean
  durationMs: number
}

/* ---------------------------------------------------------------------------
 * Guardrails
 * ------------------------------------------------------------------------- */

export type RiskLevel = "safe" | "caution" | "destructive"

export interface GuardrailAssessment {
  risk: RiskLevel
  title: string
  summary: string
  /** Concrete consequences worth reading before confirming. */
  warnings: string[]
  /**
   * When present the user must type this phrase verbatim. Destructive
   * assessments always set it; safe ones never do.
   */
  confirmation?: string
}

/* ---------------------------------------------------------------------------
 * Retention
 * ------------------------------------------------------------------------- */

export interface RetentionPolicy {
  /** Maximum datasets kept in the browser workspace. */
  maxDatasets: number
  /** Rows imported from a single sheet before the import is refused. */
  maxRowsPerDataset: number
  /** Completed runs kept in history. */
  maxRunHistory: number
  /** Snapshots kept per source table. */
  maxSnapshotsPerTable: number
  /** Datasets older than this are pruned. Zero disables age-based pruning. */
  datasetTtlDays: number
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
