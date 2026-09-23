"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Camera, History, RefreshCw, RotateCcw, Trash2 } from "lucide-react"

import { EmptyState, LoadingCard, StatusAlert } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { api } from "@/lib/api"
import { assessDropSnapshot, assessRestoreSnapshot } from "@/lib/guardrails"
import { useAppSettingsStore } from "@/lib/settings"
import { toast } from "@/lib/toast"
import type { DatabaseConfig, DatabaseTable, TableSnapshot } from "@/lib/types"
import { formatRelativeTime } from "@/lib/utils"

import { useGuardrailConfirm } from "./guardrail-gate"
import { takeSafetySnapshot } from "./safety"

interface SnapshotsPanelProps {
  connection: DatabaseConfig
  /** Row counts, used to say what a restore would replace. */
  tables: DatabaseTable[] | null
  /** A restore rewrites a table, so the tables list is stale afterwards. */
  onTablesChanged: () => void
}

/**
 * Snapshots are tables in the same database, so this panel is the only place
 * that can undo a destructive change — restoring and dropping both go through
 * the guardrail gate.
 */
export function SnapshotsPanel({ connection, tables, onTablesChanged }: SnapshotsPanelProps) {
  const snapshotBeforeMutation = useAppSettingsStore((state) => state.guardrails.snapshotBeforeMutation)
  const { ask, gate, busy } = useGuardrailConfirm()

  const [snapshots, setSnapshots] = useState<TableSnapshot[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      const response = await api.listSnapshots(connection)
      if (cancelled) return

      if (!response.ok) {
        setSnapshots(null)
        setError(response.error)
      } else {
        setSnapshots(response.data)
      }
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [connection, reload])

  const groups = useMemo(() => {
    const byTable = new Map<string, TableSnapshot[]>()
    for (const snapshot of snapshots ?? []) {
      const bucket = byTable.get(snapshot.table)
      if (bucket) bucket.push(snapshot)
      else byTable.set(snapshot.table, [snapshot])
    }
    return [...byTable.entries()]
  }, [snapshots])

  const rowCountOf = useCallback(
    (table: string) => tables?.find((candidate) => candidate.name === table)?.rowCount ?? 0,
    [tables],
  )

  const handleRestore = useCallback(
    (snapshot: TableSnapshot) => {
      ask({
        assessment: assessRestoreSnapshot(snapshot, rowCountOf(snapshot.table)),
        confirmLabel: "Restore table",
        run: async () => {
          const safety = await takeSafetySnapshot(connection, snapshot.table, snapshotBeforeMutation)
          if (!safety.ok) {
            toast.error("Nothing was restored", safety.error)
            return
          }

          const response = await api.restoreSnapshot(connection, snapshot.name)
          if (!response.ok) {
            toast.error(`Could not restore "${snapshot.table}"`, response.error)
            return
          }

          toast.success(
            `"${snapshot.table}" restored`,
            `${response.data.restoredRows.toLocaleString()} rows restored from ${snapshot.name}.${safety.note}`,
          )
          onTablesChanged()
          setReload((value) => value + 1)
        },
      })
    },
    [ask, connection, onTablesChanged, rowCountOf, snapshotBeforeMutation],
  )

  const handleDrop = useCallback(
    (snapshot: TableSnapshot) => {
      ask({
        assessment: assessDropSnapshot(snapshot),
        confirmLabel: "Delete snapshot",
        run: async () => {
          const response = await api.dropSnapshot(connection, snapshot.name)
          if (!response.ok) {
            toast.error(`Could not delete ${snapshot.name}`, response.error)
            return
          }

          toast.success(`${snapshot.name} deleted`, "The source table was not touched.")
          setReload((value) => value + 1)
        },
      })
    },
    [ask, connection],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <History className="size-4" />
            Stored snapshots
          </p>
          <p className="text-xs text-muted-foreground">
            Each snapshot is a copy of a table, kept in the same database, that you can restore or delete.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCw className={loading ? "animate-spin" : undefined} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <LoadingCard label="Reading snapshots" hint="Listing the snapshot tables in the database." />
      ) : error ? (
        <StatusAlert tone="error">{error}</StatusAlert>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<Camera />}
          title="No snapshots yet"
          description="Snapshots are taken from the Tables tab, where a table can be copied before it is changed."
        />
      ) : (
        <div className="space-y-4">
          {groups.map(([table, entries], index) => (
            <div key={table} className="space-y-2">
              {index > 0 ? <Separator /> : null}
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium">{table}</span>
                <Badge variant="outline" className="text-xs">
                  {entries.length} snapshot{entries.length === 1 ? "" : "s"}
                </Badge>
              </div>

              <ul className="space-y-2">
                {entries.map((snapshot) => (
                  <li
                    key={snapshot.name}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm">{snapshot.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {snapshot.rowCount.toLocaleString()} rows · taken {formatRelativeTime(snapshot.createdAt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => handleRestore(snapshot)}>
                        <RotateCcw />
                        Restore
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleDrop(snapshot)}>
                        <Trash2 />
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {gate}
    </div>
  )
}
