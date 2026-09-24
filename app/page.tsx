"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Database,
  FileSpreadsheet,
  Loader2,
  Table2,
  TrendingUp,
  Upload,
  Waypoints,
} from "lucide-react"

import { EmptyState, MiniBars, PageHeader, Section, StatCard, StatGrid, StatusAlert } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConnectionStorage, RunHistory } from "@/lib/storage"
import type { DatasetSummary, OperationResult } from "@/lib/types"
import { formatBytes, formatRelativeTime } from "@/lib/utils"
import { Workspace } from "@/lib/workspace"

const STATUS_TONE = {
  success: "text-emerald-600 dark:text-emerald-400",
  partial: "text-amber-600 dark:text-amber-400",
  failed: "text-destructive",
} as const

/** One entry point, so the empty state and the header actions cannot drift. */
const QUICK_ACTIONS = [
  { href: "/import", label: "Import workbooks", description: "Excel to new database tables", icon: Upload },
  { href: "/connections", label: "Manage connections", description: "Saved servers and their schemas", icon: Database },
  { href: "/data", label: "Explore data", description: "Clean, validate and reshape a dataset", icon: Table2 },
  { href: "/tables", label: "Table studio", description: "Edit a live table and sync it back", icon: Waypoints },
] as const

export default function DashboardPage() {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([])
  const [runs, setRuns] = useState<OperationResult[]>([])
  const [connectionCount, setConnectionCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Connections and runs are synchronous localStorage reads; datasets are
      // an async IndexedDB read.
      setDatasets(await Workspace.list())
      setRuns(RunHistory.getAll())
      setConnectionCount(ConnectionStorage.getAll().length)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const totalRowsImported = runs.reduce((total, run) => total + run.summary.recordsProcessed, 0)
  const totalTables = runs.reduce((total, run) => total + run.summary.tablesAffected, 0)
  const storedRows = datasets.reduce((total, dataset) => total + dataset.rowCount, 0)
  const storedBytes = datasets.reduce((total, dataset) => total + dataset.bytes, 0)
  const timeline = RunHistory.dailyCounts(14)
  const isEmpty = datasets.length === 0 && runs.length === 0 && connectionCount === 0

  return (
    <div className="text-foreground">
      <PageHeader
        title="Dashboard"
        description="Everything this workspace is holding, and where to go next."
        badge={<Badge variant="outline">Beta</Badge>}
        actions={
          <Button asChild>
            <Link href="/import">
              <Upload className="h-4 w-4" />
              New import
            </Link>
          </Button>
        }
      />

      <main className="w-full space-y-8 px-6 py-8">
        {error ? <StatusAlert tone="error">{error}</StatusAlert> : null}

        {isEmpty && !loading ? (
          <EmptyState
            title="Nothing here yet"
            description="Save a database connection and import a workbook — the workspace fills up from there."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href="/import">
                    <Upload className="h-4 w-4" />
                    Import workbooks
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/connections">
                    <Database className="h-4 w-4" />
                    Add a connection
                  </Link>
                </Button>
              </div>
            }
          />
        ) : null}

        <StatGrid>
          <StatCard
            label="Connections"
            value={loading ? "—" : connectionCount.toLocaleString()}
            icon={<Database className="h-4 w-4" />}
            hint="Saved profiles in this browser"
          />
          <StatCard
            label="Datasets"
            value={loading ? "—" : datasets.length.toLocaleString()}
            icon={<Table2 className="h-4 w-4" />}
            hint={datasets.length > 0 ? `${storedRows.toLocaleString()} rows · ${formatBytes(storedBytes)}` : "Stored in IndexedDB"}
          />
          <StatCard
            label="Tables imported"
            value={loading ? "—" : totalTables.toLocaleString()}
            icon={<TrendingUp className="h-4 w-4" />}
            hint={`Across ${runs.length} run${runs.length === 1 ? "" : "s"}`}
          />
          <StatCard
            label="Rows imported"
            value={loading ? "—" : totalRowsImported.toLocaleString()}
            icon={<FileSpreadsheet className="h-4 w-4" />}
            hint="Counted from completed runs"
          />
        </StatGrid>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group flex min-w-0 items-center gap-3 rounded-2xl border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{action.label}</span>
                  <span className="block truncate text-sm text-muted-foreground">{action.description}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            )
          })}
        </section>

        <div className="grid gap-6 xl:grid-cols-2">
          <Section
            title="Recent runs"
            description="Completed imports, newest first."
            actions={
              runs.length > 0 ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/import">Import again</Link>
                </Button>
              ) : null
            }
          >
            {loading ? (
              <LoadingRow />
            ) : runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {runs.slice(0, 6).map((run) => (
                  <div key={run.id} className="flex items-center justify-between gap-4 rounded-xl border bg-muted/20 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {run.configuration.connectionName} · {run.configuration.databaseName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {run.summary.tablesAffected} table{run.summary.tablesAffected === 1 ? "" : "s"} ·{" "}
                        {run.summary.recordsProcessed.toLocaleString()} rows · {formatRelativeTime(run.timestamp)}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-medium ${STATUS_TONE[run.status]}`}>{run.status}</span>
                  </div>
                ))}
              </div>
            )}

            {runs.length > 0 ? (
              <div className="mt-4 border-t pt-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Runs over the last two weeks</p>
                <MiniBars values={timeline.map((bucket) => bucket.count)} label="Runs per day" />
              </div>
            ) : null}
          </Section>

          <Section
            title="Datasets"
            description="Workbooks parsed into the browser workspace."
            actions={
              datasets.length > 0 ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/data">Explore</Link>
                </Button>
              ) : null
            }
          >
            {loading ? (
              <LoadingRow />
            ) : datasets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No datasets stored. Import a workbook, or open{" "}
                <Link href="/data" className="underline">
                  Data
                </Link>{" "}
                to add one.
              </p>
            ) : (
              <div className="space-y-2">
                {datasets.slice(0, 6).map((dataset) => (
                  <Link
                    key={dataset.id}
                    href="/data"
                    className="flex items-center justify-between gap-4 rounded-xl border bg-muted/20 p-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{dataset.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {dataset.sourceFile} · {dataset.rowCount.toLocaleString()} rows · {dataset.columnCount} columns
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {dataset.operationCount > 0 ? (
                        <Badge variant="outline">{dataset.operationCount} ops</Badge>
                      ) : null}
                      <span className="text-xs text-muted-foreground">{formatRelativeTime(dataset.updatedAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Section>
        </div>
      </main>
    </div>
  )
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Reading the workspace
    </div>
  )
}
