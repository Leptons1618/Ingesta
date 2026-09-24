import type { PreviewOptions } from "@/lib/db"
import type {
  AlterAction,
  ConnectionTestResult,
  DatabaseColumn,
  DatabaseConfig,
  DatabaseTable,
  InsertExecutionOptions,
  InsertReport,
  LocalServices,
  QueryResult,
  RowMutation,
  ServerOptions,
  TableCreationConfig,
  TableSnapshot,
} from "@/lib/types"
import { errorMessage } from "@/lib/utils"

/**
 * A route that failed may still report what it managed to do — a partial insert
 * knows how many rows landed before the batch that failed — so a failure carries
 * the raw body as a best-effort partial. It is typed `Partial<T>` because a
 * failure body is not guaranteed to hold every success field.
 */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; partial?: Partial<T> }

/**
 * Every API route answers with `{ success, ... }`. This turns both transport
 * failures and `success: false` payloads into one shape the UI can render.
 */
export async function postJson<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const payload = (await response.json().catch(() => null)) as (T & { success?: boolean; message?: string }) | null

    if (!payload) return { ok: false, error: `Request to ${path} failed (${response.status})` }
    if (!response.ok || payload.success === false) {
      return {
        ok: false,
        error: payload.message ?? `Request to ${path} failed (${response.status})`,
        partial: payload,
      }
    }

    return { ok: true, data: payload }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}

/**
 * Routes wrap their answer in `{ success, … }`; callers want the value inside
 * it, so the envelope is unwrapped once, here, and nowhere else.
 *
 * The partial from a failure is dropped rather than picked: `pick` reads fields
 * the failure body does not have, and a caller of these routes wants the error,
 * not half a payload.
 */
async function unwrap<T extends object, P>(
  path: string,
  body: unknown,
  pick: (payload: T) => P,
): Promise<ApiResult<P>> {
  const result = await postJson<T>(path, body)
  return result.ok ? { ok: true, data: pick(result.data) } : { ok: false, error: result.error }
}

/** The one client the UI talks to: every call names its route and its payload. */
export const api = {
  testConnection: (config: DatabaseConfig) =>
    unwrap("/api/test-connection", config, (payload: ConnectionTestResult) => payload),

  /** What is listening on this machine; a probe, not an authentication. */
  listLocalServices: () =>
    unwrap("/api/local-services", {}, (payload: LocalServices) => payload),

  listDatabases: (config: ServerOptions) =>
    unwrap("/api/list-databases", { config }, (payload: { databases: string[] }) => payload.databases),

  createDatabase: (config: ServerOptions, databaseName: string) =>
    unwrap("/api/create-database", { config, databaseName }, (payload: { message: string }) => payload),

  dropDatabase: (config: ServerOptions, databaseName: string) =>
    unwrap("/api/drop-database", { config, databaseName }, (payload: { message: string }) => payload),

  getTables: (config: DatabaseConfig) =>
    unwrap("/api/get-tables", config, (payload: { tables: DatabaseTable[] }) => payload.tables),

  createTable: (config: DatabaseConfig, tableConfig: TableCreationConfig) =>
    unwrap("/api/create-table", { config, tableConfig }, (payload: { message: string }) => payload),

  /**
   * `options.execution` is the batching policy for this table; without it the
   * insert is one transaction. `options.columnTypes` is what `convertTypes`
   * coerces against, index-aligned with `columnNames`.
   */
  insertData: (
    config: DatabaseConfig,
    tableName: string,
    columnNames: string[],
    data: unknown[][],
    options: { execution?: Partial<InsertExecutionOptions>; columnTypes?: string[] } = {},
  ) =>
    unwrap(
      "/api/insert-data",
      { config, tableName, columnNames, data, ...options },
      (payload: InsertReport) => payload,
    ),

  previewTable: (config: DatabaseConfig, tableName: string, options: PreviewOptions = {}) =>
    unwrap(
      "/api/preview-table",
      { config, tableName, ...options },
      (payload: { columns: string[]; data: unknown[][]; totalRows: number }) => payload,
    ),

  getTableStructure: (config: DatabaseConfig, tableName: string) =>
    unwrap("/api/table-structure", { config, tableName }, (payload: { columns: DatabaseColumn[] }) => payload.columns),

  alterTable: (config: DatabaseConfig, tableName: string, change: AlterAction) =>
    unwrap("/api/alter-table", { config, tableName, change }, (payload: { message: string }) => payload),

  dropTable: (config: DatabaseConfig, tableName: string) =>
    unwrap(
      "/api/table-admin",
      { config, tableName, action: "drop" },
      (payload: { message: string }) => payload,
    ),

  truncateTable: (config: DatabaseConfig, tableName: string) =>
    unwrap(
      "/api/table-admin",
      { config, tableName, action: "truncate" },
      (payload: { deletedRows: number }) => payload,
    ),

  renameTable: (config: DatabaseConfig, tableName: string, to: string) =>
    api.alterTable(config, tableName, { action: "rename-table", to }),

  mutateRows: (config: DatabaseConfig, tableName: string, mutation: RowMutation) =>
    unwrap("/api/table-rows", { config, tableName, mutation }, (payload: { affectedRows: number }) => payload),

  listSnapshots: (config: DatabaseConfig) =>
    unwrap("/api/snapshots", { config, action: "list" }, (payload: { snapshots: TableSnapshot[] }) => payload.snapshots),

  createSnapshot: (config: DatabaseConfig, tableName: string, name?: string, maxSnapshots?: number) =>
    unwrap(
      "/api/snapshots",
      { config, action: "create", tableName, snapshotName: name, maxSnapshots },
      (payload: { snapshot: TableSnapshot }) => payload.snapshot,
    ),

  restoreSnapshot: (config: DatabaseConfig, snapshotName: string) =>
    unwrap(
      "/api/snapshots",
      { config, action: "restore", snapshotName },
      (payload: { restoredRows: number }) => payload,
    ),

  dropSnapshot: (config: DatabaseConfig, snapshotName: string) =>
    unwrap(
      "/api/snapshots",
      { config, action: "drop", snapshotName },
      (payload: { message: string }) => payload,
    ),

  copyTable: (config: DatabaseConfig, source: string, target: string, mode: "create" | "append" | "replace") =>
    unwrap("/api/copy-table", { config, source, target, mode }, (payload: { copiedRows: number }) => payload),

  runQuery: (config: DatabaseConfig, sql: string, options: { maxRows?: number; allowWrite?: boolean } = {}) =>
    unwrap("/api/run-query", { config, sql, ...options }, (payload: QueryResult) => payload),
}
