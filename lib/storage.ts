import type {
  CreatedTable,
  DatabaseConfig,
  DatabaseType,
  FailedTable,
  FileResult,
  OperationResult,
  TableResult,
} from "@/lib/types"
import { newId } from "@/lib/utils"

const CONNECTIONS_KEY = "ingesta-connections"
const HISTORY_KEY = "ingesta-operation-history"
const CONNECTION_EXPORT_VERSION = 1

/** What a connection backup file looks like. */
interface ConnectionBackup {
  version: number
  exportedAt: string
  /** False when passwords were stripped on the way out. */
  includesSecrets: boolean
  connections: DatabaseConfig[]
}

/** Connection profiles live only in the browser; passwords never leave the device. */
export class ConnectionStorage {
  static getAll(): DatabaseConfig[] {
    return read<DatabaseConfig[]>(CONNECTIONS_KEY, [])
  }

  /** Pinned first, then most recently used, then alphabetical. */
  static sortForDisplay(connections: DatabaseConfig[]): DatabaseConfig[] {
    return connections.slice().sort((left, right) => {
      if (Boolean(left.favorite) !== Boolean(right.favorite)) return left.favorite ? -1 : 1
      const leftUsed = left.lastUsedAt ?? ""
      const rightUsed = right.lastUsedAt ?? ""
      if (leftUsed !== rightUsed) return rightUsed.localeCompare(leftUsed)
      return left.name.localeCompare(right.name)
    })
  }

  static get(id: string): DatabaseConfig | null {
    return ConnectionStorage.getAll().find((connection) => connection.id === id) ?? null
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

  /** Copies a profile under a new id so the original keeps working. */
  static duplicate(id: string): DatabaseConfig | null {
    const original = ConnectionStorage.get(id)
    if (!original) return null
    const copy: DatabaseConfig = { ...original, id: newId("conn"), name: `${original.name} copy`, favorite: false, lastUsedAt: undefined }
    ConnectionStorage.save(copy)
    return copy
  }

  /** Records a successful open, which is what the picker sorts by. */
  static markUsed(id: string): void {
    const connection = ConnectionStorage.get(id)
    if (!connection) return
    ConnectionStorage.save({ ...connection, lastUsedAt: new Date().toISOString() })
  }

  static toggleFavorite(id: string): void {
    const connection = ConnectionStorage.get(id)
    if (!connection) return
    ConnectionStorage.save({ ...connection, favorite: !connection.favorite })
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

  /**
   * A backup of every saved profile. Passwords are included by default because
   * a backup that cannot reconnect is not a backup — the caller is expected to
   * tell the user the file holds credentials.
   */
  static exportJson({ includeSecrets = true }: { includeSecrets?: boolean } = {}): string {
    const backup: ConnectionBackup = {
      version: CONNECTION_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      includesSecrets: includeSecrets,
      connections: ConnectionStorage.sortForDisplay(ConnectionStorage.getAll()).map((connection) =>
        includeSecrets ? connection : { ...connection, password: undefined, connectionString: undefined },
      ),
    }
    return JSON.stringify(backup, null, 2)
  }

  /**
   * Restores profiles from a backup. `merge` keeps existing ids up to date and
   * adds the rest; `replace` discards everything currently saved.
   */
  static importJson(text: string, mode: "merge" | "replace" = "merge"): { added: number; updated: number; removed: number } {
    const parsed = JSON.parse(text) as Partial<ConnectionBackup>
    if (!Array.isArray(parsed.connections)) throw new Error("This file does not contain a connection list")

    const existing = ConnectionStorage.getAll()
    const incoming = parsed.connections.filter((connection): connection is DatabaseConfig =>
      Boolean(connection) && typeof connection.id === "string" && typeof connection.name === "string" && typeof connection.database === "string",
    )
    if (incoming.length === 0) throw new Error("The connection list in this file is empty")

    if (mode === "replace") {
      write(CONNECTIONS_KEY, incoming)
      return { added: incoming.length, updated: 0, removed: existing.length }
    }

    const byId = new Map(existing.map((connection) => [connection.id, connection]))
    let added = 0
    let updated = 0
    for (const connection of incoming) {
      if (byId.has(connection.id)) updated += 1
      else added += 1
      byId.set(connection.id, connection)
    }

    write(CONNECTIONS_KEY, [...byId.values()])
    return { added, updated, removed: 0 }
  }
}

/** Completed import runs, kept locally so the summary survives a reload. */
export class RunHistory {
  static record(result: OperationResult, limit = 20): void {
    write(HISTORY_KEY, [result, ...RunHistory.getAll()].slice(0, Math.max(1, limit)))
  }

  static getAll(): OperationResult[] {
    return read<OperationResult[]>(HISTORY_KEY, [])
  }

  static clear(): void {
    write(HISTORY_KEY, [])
  }

  /** Trims stored history to a new limit, oldest runs first. */
  static trim(limit: number): number {
    const all = RunHistory.getAll()
    if (all.length <= limit) return 0
    write(HISTORY_KEY, all.slice(0, Math.max(1, limit)))
    return all.length - Math.max(1, limit)
  }

  /** Runs per day over the last two weeks, for the dashboard timeline. */
  static dailyCounts(days = 14): Array<{ day: string; count: number; rows: number }> {
    const buckets: Array<{ day: string; count: number; rows: number }> = []
    const today = new Date()
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(today.getTime() - offset * 86_400_000)
      buckets.push({ day: date.toISOString().slice(0, 10), count: 0, rows: 0 })
    }
    const index = new Map(buckets.map((bucket) => [bucket.day, bucket]))
    for (const run of RunHistory.getAll()) {
      const bucket = index.get(run.timestamp.slice(0, 10))
      if (!bucket) continue
      bucket.count += 1
      bucket.rows += run.summary.recordsProcessed
    }
    return buckets
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

export function downloadFile(filename: string, content: string | Blob, mimeType: string): void {
  const blob = typeof content === "string" ? new Blob([content], { type: mimeType }) : content
  const url = URL.createObjectURL(blob)
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
