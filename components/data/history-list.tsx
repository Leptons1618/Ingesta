"use client"

import { ArrowRight, History, RotateCcw, Trash2 } from "lucide-react"

import { EmptyState } from "@/components/common"
import { Button } from "@/components/ui/button"
import type { OperationEntry } from "@/lib/types"
import { formatRelativeTime } from "@/lib/utils"

/**
 * The operation history.
 *
 * Rolling back is not an undo of the last step — it is truncating the list and
 * replaying from the base grid, so any earlier point is reachable in one click
 * and the result is exact.
 */
export function OperationHistory({
  entries,
  baseRows,
  onRollback,
  onClear,
  disabled,
}: {
  entries: OperationEntry[]
  /** Row count of the grid before any operation, shown as the starting point. */
  baseRows: number
  /** Keep the first `index` operations; `0` returns to the base grid. */
  onRollback: (index: number) => void
  onClear: () => void
  disabled?: boolean
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        title="No operations yet"
        description="Every change you apply is recorded here, and any of them can be rolled back."
        icon={<History className="h-5 w-5" />}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {entries.length} operation{entries.length === 1 ? "" : "s"} applied
        </p>
        <Button variant="ghost" size="sm" onClick={onClear} disabled={disabled}>
          <Trash2 className="h-3.5 w-3.5" />
          Reset to source
        </Button>
      </div>

      <ol className="space-y-2">
        <li className="rounded-xl border border-dashed bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Source data</p>
              <p className="text-xs text-muted-foreground">{baseRows.toLocaleString()} rows as parsed</p>
            </div>
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onRollback(0)}>
              <RotateCcw className="h-3.5 w-3.5" />
              Revert
            </Button>
          </div>
        </li>

        {entries.map((entry, index) => (
          <li key={entry.id} className="rounded-xl border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {index + 1}
                  </span>
                  {formatRelativeTime(entry.createdAt)}
                </p>
                <p className="mt-1.5 text-sm break-words">{entry.summary}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{entry.effect.rowsIn.toLocaleString()} rows</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className={entry.effect.rowsOut !== entry.effect.rowsIn ? "font-medium text-foreground" : undefined}>
                    {entry.effect.rowsOut.toLocaleString()}
                  </span>
                  {entry.effect.columnsOut !== entry.effect.columnsIn ? (
                    <>
                      <span className="mx-1">·</span>
                      <span>
                        {entry.effect.columnsIn} → {entry.effect.columnsOut} columns
                      </span>
                    </>
                  ) : null}
                  {entry.effect.cellsChanged > 0 ? (
                    <>
                      <span className="mx-1">·</span>
                      <span>{entry.effect.cellsChanged.toLocaleString()} cells changed</span>
                    </>
                  ) : null}
                </p>
              </div>

              {index < entries.length - 1 ? (
                <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onRollback(index + 1)}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Roll back to here
                </Button>
              ) : (
                <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onRollback(index)}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Undo
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
