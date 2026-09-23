"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Download, UploadCloud } from "lucide-react"

import { ConfirmDialog, RiskBadge, Section, StatusAlert } from "@/components/common"
import { ConnectionSelect } from "@/components/connection-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api } from "@/lib/api"
import { EXPORT_FORMATS, exportGrid, safeFileName } from "@/lib/export"
import { assessOverwrite } from "@/lib/guardrails"
import { pushGrid, type PushMode } from "@/lib/push"
import { sanitizeTableName } from "@/lib/schema"
import { useAppSettingsStore } from "@/lib/settings"
import { ConnectionStorage } from "@/lib/storage"
import { toast } from "@/lib/toast"
import type { DatabaseConfig, Grid } from "@/lib/types"

const MODES: Array<{ value: PushMode; label: string }> = [
  { value: "create", label: "Create a new table" },
  { value: "append", label: "Append to an existing table" },
  { value: "replace", label: "Replace a table's contents" },
]

const CONFIRM_LABEL: Record<PushMode, string> = {
  create: "Create table",
  append: "Append rows",
  replace: "Replace contents",
}

/**
 * The export tab.
 *
 * Downloading and pushing are the two ways a grid leaves the browser, so they
 * share one panel: what you see exported is exactly what is pushed, and the
 * push runs through the same guardrail assessment the database pages use.
 */
export function ExportPanel({ grid, datasetName }: { grid: Grid; datasetName: string }) {
  const [connections, setConnections] = useState<DatabaseConfig[]>([])
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [mode, setMode] = useState<PushMode>("create")
  const [target, setTarget] = useState(() => sanitizeTableName(datasetName))
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pushing, setPushing] = useState(false)
  const snapshotBeforeMutation = useAppSettingsStore((state) => state.guardrails.snapshotBeforeMutation)

  // Connections live in localStorage, which only exists once the page is running.
  useEffect(() => setConnections(ConnectionStorage.getAll()), [])

  // A different dataset means a different target table; keeping the old name
  // would quietly push into the previous table.
  useEffect(() => setTarget(sanitizeTableName(datasetName)), [datasetName])

  const connection = connections.find((entry) => entry.id === connectionId) ?? null
  const tableName = target.trim()
  const assessment = useMemo(
    () => assessOverwrite(tableName || "the target table", grid.rows.length, mode),
    [grid.rows.length, mode, tableName],
  )
  const ready = Boolean(connection) && tableName.length > 0

  const push = async () => {
    if (!connection || !tableName) return
    setPushing(true)
    try {
      // Replacing contents deletes rows that only a snapshot can bring back, so
      // the snapshot is taken before anything is written and the push stops if
      // it cannot be taken.
      let snapshotNote = ""
      if (mode === "replace" && snapshotBeforeMutation) {
        const snapshot = await api.createSnapshot(connection, tableName)
        if (!snapshot.ok) {
          toast.error("Snapshot failed, so nothing was replaced", snapshot.error)
          return
        }
        snapshotNote = ` Snapshot "${snapshot.data.name}" was taken first.`
      }

      const result = await pushGrid({ config: connection, grid, tableName, mode })
      if (!result.ok) {
        toast.error("Push failed", result.error)
        return
      }

      ConnectionStorage.markUsed(connection.id)
      setConnections(ConnectionStorage.getAll())
      toast.success(
        `Wrote ${result.data.rowsWritten.toLocaleString()} rows to "${result.data.tableName}"`,
        `${result.data.created ? "The table was created." : "The existing table was used."}${snapshotNote}`,
      )
    } finally {
      setPushing(false)
      setConfirmOpen(false)
    }
  }

  return (
    <div className="space-y-6">
      <Section
        title="Download"
        description={`The grid as it stands: ${grid.rows.length.toLocaleString()} rows and ${grid.columns.length} columns.`}
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {EXPORT_FORMATS.map((format) => (
            <button
              key={format.value}
              type="button"
              onClick={() => {
                exportGrid(grid, datasetName, format.value)
                toast.success(`Exported ${safeFileName(datasetName, format.extension)}`)
              }}
              className="cursor-pointer rounded-xl border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Download className="size-4" />
                {format.label}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{format.description}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="Push to a database"
        description="Write this grid into a table — as a new table, appended to one, or in place of its contents."
      >
        {connections.length === 0 ? (
          <StatusAlert tone="info">
            No connections are saved in this browser yet.{" "}
            <Link href="/connections" className="underline">
              Add one
            </Link>{" "}
            and it appears in the picker here.
          </StatusAlert>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Connection</label>
                <ConnectionSelect
                  connections={connections}
                  value={connectionId}
                  onChange={(config) => setConnectionId(config?.id ?? null)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Mode</label>
                <Select value={mode} onValueChange={(value) => setMode(value as PushMode)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODES.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium">Target table</label>
                <Input
                  value={target}
                  spellCheck={false}
                  className="font-mono text-sm"
                  placeholder="table_name"
                  onChange={(event) => setTarget(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Columns are matched by name, and every cell is coerced to its column's type before it is written.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3">
              <div className="min-w-0 space-y-1.5">
                <RiskBadge risk={assessment.risk} />
                <p className="text-sm">{assessment.summary}</p>
              </div>
              <Button disabled={!ready || pushing} onClick={() => setConfirmOpen(true)}>
                <UploadCloud className="size-4" />
                Review and push
              </Button>
            </div>
          </div>
        )}
      </Section>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        assessment={assessment}
        busy={pushing}
        confirmLabel={CONFIRM_LABEL[mode]}
        onConfirm={() => void push()}
      />
    </div>
  )
}
