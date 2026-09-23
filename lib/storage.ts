import type {
  CreatedTable,
  DatabaseConfig,
  DatabaseType,
  FailedTable,
  FileResult,
  OperationResult,
  TableResult,
} from "@/lib/types"

const CONNECTIONS_KEY = "ingesta-connections"
const HISTORY_KEY = "ingesta-operation-history"

/** Connection profiles live only in the browser; passwords never leave the device. */
export class ConnectionStorage {
  static getAll(): DatabaseConfig[] {
    return read<DatabaseConfig[]>(CONNECTIONS_KEY, [])
  }

  static save(config: DatabaseConfig): void {
    const connections = ConnectionStorage.getAll().filter((existing) => existing.id !== config.id)
    write(CONNECTIONS_KEY, [...connections, config])
  }

  static remove(id: string): void {
    write(
      CONNECTIONS_KEY,
      ConnectionStorage.getAll().filter((connection) => connection.id !== id),
    )
  }

  /** Display-only preview of the connection; credentials are never masked here on purpose. */
  static connectionString(config: DatabaseConfig): string {
    const { username, password, host, database, ssl } = config
    switch (config.type) {
      case "mysql":
        return `mysql://${username}:${password}@${host}:${config.port ?? 3306}/${database}${ssl ? "?ssl=true" : ""}`
      case "postgresql":
        return `postgresql://${username}:${password}@${host}:${config.port ?? 5432}/${database}${ssl ? "?sslmode=require" : ""}`
      case "mssql":
        return `mssql://${username}:${password}@${host}:${config.port ?? 1433}/${database}${ssl ? "?encrypt=true" : ""}`
      case "sqlite":
        return `sqlite://${database}`
      default:
        return ""
    }
  }
}

/** Completed import runs, kept locally so the summary survives a reload. */
export class RunHistory {
  private static readonly limit = 20

  static record(result: OperationResult): void {
    write(HISTORY_KEY, [result, ...RunHistory.getAll()].slice(0, RunHistory.limit))
  }

  static getAll(): OperationResult[] {
    return read<OperationResult[]>(HISTORY_KEY, [])
  }

  static throughput(result: OperationResult): number {
    const { recordsProcessed, executionTimeMs } = result.summary
    return executionTimeMs === 0 ? 0 : (recordsProcessed / executionTimeMs) * 1000
  }

  static download(result: OperationResult): void {
    const report = {
      operation: result,
      generatedAt: new Date().toISOString(),
      metrics: {
        recordsPerSecond: RunHistory.throughput(result),
        duration: `${(result.summary.executionTimeMs / 1000).toFixed(2)}s`,
      },
    }

    downloadFile(`ingesta-run-${result.id}.json`, JSON.stringify(report, null, 2), "application/json")
  }
}

/** Assembles the persisted summary of a finished run from its real measurements. */
export function buildRunResult({
  createdTables,
  failedTables,
  durationMs,
  config,
}: {
  createdTables: CreatedTable[]
  failedTables: FailedTable[]
  /** Wall time of the create-and-insert phase, measured by the caller. */
  durationMs: number
  config: DatabaseConfig
}): OperationResult {
  const executionTimeMs = Math.max(durationMs, 0)
  const recordsProcessed = createdTables.reduce((total, table) => total + table.rowCount, 0)

  const byFile = new Map<string, FileResult>()
  for (const table of createdTables) {
    const file = byFile.get(table.fileName) ?? {
      fileName: table.fileName,
      status: "success",
      sheetsProcessed: 0,
      recordsProcessed: 0,
      processingTimeMs: 0,
      errors: [],
    }
    file.sheetsProcessed += 1
    file.recordsProcessed += table.rowCount
    byFile.set(table.fileName, file)
  }
  for (const failure of failedTables) {
    const file = byFile.get(failure.fileName) ?? {
      fileName: failure.fileName,
      status: "failed",
      sheetsProcessed: 0,
      recordsProcessed: 0,
      processingTimeMs: 0,
      errors: [],
    }
    file.status = "partial"
    file.errors.push(`${failure.tableName}: ${failure.message}`)
    byFile.set(failure.fileName, file)
  }

  const tableResults: TableResult[] = [
    ...createdTables.map((table) => ({
      tableName: table.tableName,
      status: "success" as const,
      recordsInserted: table.rowCount,
      recordsFailed: 0,
      executionTimeMs,
      errors: [],
    })),
    ...failedTables.map((table) => ({
      tableName: table.tableName,
      status: "failed" as const,
      recordsInserted: 0,
      recordsFailed: 0,
      executionTimeMs,
      errors: [table.message],
    })),
  ]

  const status = failedTables.length === 0 ? "success" : createdTables.length === 0 ? "failed" : "partial"

  return {
    id: `run_${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    status,
    summary: {
      filesProcessed: byFile.size,
      sheetsProcessed: createdTables.length + failedTables.length,
      tablesAffected: createdTables.length,
      recordsProcessed,
      executionTimeMs,
    },
    details: {
      fileResults: [...byFile.values()],
      tableResults,
      warnings: failedTables.map((table) => `${table.tableName}: ${table.message}`),
    },
    configuration: {
      databaseType: config.type as DatabaseType,
      databaseName: config.database,
      connectionName: config.name,
    },
  }
}

export function downloadFile(filename: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const stored = window.localStorage.getItem(key)
    return stored ? (JSON.parse(stored) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(key, JSON.stringify(value))
}
