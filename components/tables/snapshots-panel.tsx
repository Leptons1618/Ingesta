"use client"

import { useState } from "react"
import { Camera, History, Loader2, RefreshCw } from "lucide-react"

import { Section } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { TableSnapshot } from "@/lib/types"
import { formatRelativeTime } from "@/lib/utils"

/**
 * Snapshots are real tables, so the list is per source table: restoring one
 * replaces the rows of the table it was taken from.
 */
export function SnapshotsPanel({
  snapshots,
  loading,
  busy,
  onTake,
  onRestore,
  onRefresh,
}: {
  snapshots: TableSnapshot[]
  loading: boolean
  busy: boolean
  onTake: (name: string) => void
  onRestore: (snapshot: TableSnapshot) => void
  onRefresh: () => void
}) {
  const [name, setName] = useState("")

  return (
    <Section
      title="Snapshots"
      description="A snapshot copies the table's rows so a destructive change can be undone."
      actions={
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1 space-y-1">
            <label className="text-xs font-medium" htmlFor="table-studio-snapshot-name">
              Snapshot name (optional)
            </label>
            <Input
              id="table-studio-snapshot-name"
              value={name}
              placeholder="before-column-edit"
              className="h-8"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              onTake(name.trim())
              setName("")
            }}
          >
            <Camera className="h-4 w-4" />
            Take snapshot
          </Button>
        </div>

        {snapshots.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No snapshots for this table yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {snapshots.map((snapshot) => (
              <li
                key={snapshot.name}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs">{snapshot.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {snapshot.rowCount.toLocaleString()} rows · {formatRelativeTime(snapshot.createdAt)}
                  </p>
                </div>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => onRestore(snapshot)}>
                  <History className="h-3.5 w-3.5" />
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}
