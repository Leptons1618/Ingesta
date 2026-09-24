/**
 * The browser workspace: datasets that survive a reload.
 *
 * `localStorage` is the wrong home for these — a single sheet blows past its
 * ~5 MB budget — so datasets live in IndexedDB. Connections and run history
 * stay in `localStorage` (`lib/storage.ts`) because they are tiny and are read
 * synchronously while a page renders.
 *
 * Every entry point is safe to call during server rendering: the module returns
 * empty results instead of throwing when IndexedDB is unavailable.
 */

import { applyOperations, gridBytes } from "@/lib/operations"
import type { Dataset, DatasetSummary, Grid, OperationEntry, RetentionPolicy } from "@/lib/types"

const DATABASE_NAME = "ingesta-workspace"
const DATABASE_VERSION = 1
const DATASETS = "datasets"

/** The stored record: a base grid plus the operations applied on top of it. */
interface DatasetRecord {
  id: string
  name: string
  sourceFile: string
  sheetName: string
  base: Grid
  operations: OperationEntry[]
  createdAt: string
  updatedAt: string
  /** Cached list/usage metadata; old records are backfilled on their next list. */
  summary?: DatasetSummary
}

const hasIndexedDb = () => typeof indexedDB !== "undefined"

let handle: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (handle) return handle

  handle = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(DATASETS)) database.createObjectStore(DATASETS, { keyPath: "id" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Could not open the workspace database"))
  }).catch((error) => {
    handle = null
    throw error
  })

  return handle
}

function transact<T>(store: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(store, mode)
        const request = run(transaction.objectStore(store))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error("Workspace request failed"))
      }),
  )
}

/** Resolves the stored record to the grid the caller sees. */
export function resolveDataset(record: DatasetRecord): Dataset {
  return {
    id: record.id,
    name: record.name,
    sourceFile: record.sourceFile,
    sheetName: record.sheetName,
    base: record.base,
    operations: record.operations,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

/** The grid a dataset currently represents: its base with every operation replayed. */
export function datasetGrid(dataset: Dataset): Grid {
  if (dataset.operations.length === 0) return dataset.base
  return applyOperations(
    dataset.base,
    dataset.operations.map((entry) => entry.operation),
  ).grid
}

function summarise(record: DatasetRecord): DatasetSummary {
  if (record.summary) return record.summary

  const grid = datasetGrid(resolveDataset(record))
  return {
    id: record.id,
    name: record.name,
    sourceFile: record.sourceFile,
    sheetName: record.sheetName,
    rowCount: grid.rows.length,
    columnCount: grid.columns.length,
    operationCount: record.operations.length,
    bytes: gridBytes(grid),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function asRecord(dataset: Dataset): DatasetRecord {
  const record: DatasetRecord = {
    id: dataset.id,
    name: dataset.name,
    sourceFile: dataset.sourceFile,
    sheetName: dataset.sheetName,
    base: dataset.base,
    operations: dataset.operations,
    createdAt: dataset.createdAt,
    updatedAt: dataset.updatedAt,
  }
  return { ...record, summary: summarise(record) }
}

export const Workspace = {
  /** Summaries only — new records carry cached metadata; legacy records are backfilled once. */
  async list(): Promise<DatasetSummary[]> {
    if (!hasIndexedDb()) return []
    const records = await transact<DatasetRecord[]>(DATASETS, "readonly", (store) => store.getAll() as IDBRequest<DatasetRecord[]>)
    const summaries = records.map(summarise)
    const legacy = records.filter((record) => !record.summary)
    if (legacy.length > 0) {
      await Promise.all(
        legacy.map((record, index) =>
          transact(DATASETS, "readwrite", (store) => store.put({ ...record, summary: summaries[index] })),
        ),
      )
    }
    return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  },

  async get(id: string): Promise<Dataset | null> {
    if (!hasIndexedDb()) return null
    const record = await transact<DatasetRecord | undefined>(DATASETS, "readonly", (store) => store.get(id) as IDBRequest<DatasetRecord | undefined>)
    return record ? resolveDataset(record) : null
  },

  async put(dataset: Dataset): Promise<void> {
    if (!hasIndexedDb()) return
    await transact(DATASETS, "readwrite", (store) => store.put(asRecord(dataset)))
  },

  async remove(id: string): Promise<void> {
    if (!hasIndexedDb()) return
    await transact(DATASETS, "readwrite", (store) => store.delete(id))
  },

  async clear(): Promise<void> {
    if (!hasIndexedDb()) return
    await transact(DATASETS, "readwrite", (store) => store.clear())
  },

  /**
   * Enforces the retention policy: age first, then count, oldest first. Returns
   * what was removed so the caller can say so out loud instead of deleting
   * quietly.
   */
  async prune(policy: RetentionPolicy): Promise<{ removed: DatasetSummary[]; remaining: number }> {
    if (!hasIndexedDb()) return { removed: [], remaining: 0 }

    const summaries = await this.list()
    const now = Date.now()
    const doomed = new Set<string>()

    if (policy.datasetTtlDays > 0) {
      const cutoff = now - policy.datasetTtlDays * 86_400_000
      for (const summary of summaries) {
        if (new Date(summary.updatedAt).getTime() < cutoff) doomed.add(summary.id)
      }
    }

    const survivors = summaries.filter((summary) => !doomed.has(summary.id))
    if (survivors.length > policy.maxDatasets) {
      for (const summary of survivors.slice(policy.maxDatasets)) doomed.add(summary.id)
    }

    const removed = summaries.filter((summary) => doomed.has(summary.id))
    for (const summary of removed) await this.remove(summary.id)

    return { removed, remaining: summaries.length - removed.length }
  },

  async usage(): Promise<{ datasets: number; rows: number; bytes: number }> {
    const summaries = await this.list()
    return {
      datasets: summaries.length,
      rows: summaries.reduce((total, summary) => total + summary.rowCount, 0),
      bytes: summaries.reduce((total, summary) => total + summary.bytes, 0),
    }
  },

  /** Narrows a freshly parsed grid to what the retention policy allows. */
  clampRows(grid: Grid, limit: number): { grid: Grid; dropped: number } {
    if (limit <= 0 || grid.rows.length <= limit) return { grid, dropped: 0 }
    return { grid: { columns: grid.columns, rows: grid.rows.slice(0, limit) }, dropped: grid.rows.length - limit }
  },
}
