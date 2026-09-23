"use client"

import { useMemo, useState } from "react"
import { Check, X } from "lucide-react"

import { DataTable, Section } from "@/components/common"
import { Button } from "@/components/ui/button"
import { OperationBuilder } from "@/components/data/operation-builder"
import { applyOperation, describeOperation, type OperationOutcome } from "@/lib/operations"
import type { DataOperation, Grid } from "@/lib/types"
import { errorMessage } from "@/lib/utils"

/** Enough of the result to recognise it, small enough to render instantly. */
const PREVIEW_ROWS = 5

/**
 * The operations tab.
 *
 * The builder hands over a complete operation; this panel runs it against the
 * current grid before anything is recorded, so the numbers in the review card
 * are the effect the dataset is about to record — measured, not estimated.
 */
export function OperationsPanel({
  grid,
  appliedCount,
  onApply,
  busy,
}: {
  grid: Grid
  appliedCount: number
  onApply: (operation: DataOperation) => void
  busy?: boolean
}) {
  const [pending, setPending] = useState<DataOperation | null>(null)

  // Runs once per submitted operation rather than per keystroke, because the
  // builder only ever hands over an operation that is already complete.
  const preview = useMemo((): { outcome: OperationOutcome } | { error: string } | null => {
    if (!pending) return null
    try {
      return { outcome: applyOperation(grid, pending) }
    } catch (error) {
      return { error: errorMessage(error) }
    }
  }, [grid, pending])

  const apply = () => {
    if (!pending) return
    onApply(pending)
    setPending(null)
  }

  return (
    <Section
      title="Operations"
      description="Each operation is recorded with the effect it measured, and can be rolled back from History."
    >
      <div className="space-y-4">
        <OperationBuilder grid={grid} onAdd={setPending} disabled={busy} />

        {pending && preview ? (
          <div className="space-y-3 rounded-xl border bg-muted/20 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Review</p>
                <p className="text-sm font-medium">{describeOperation(pending)}</p>
                {"outcome" in preview ? (
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {preview.outcome.effect.rowsIn.toLocaleString()} →{" "}
                      {preview.outcome.effect.rowsOut.toLocaleString()} rows
                    </span>
                    <span aria-hidden>·</span>
                    <span>
                      {preview.outcome.effect.columnsIn} → {preview.outcome.effect.columnsOut} columns
                    </span>
                    <span aria-hidden>·</span>
                    <span>{preview.outcome.effect.cellsChanged.toLocaleString()} cells change</span>
                  </p>
                ) : (
                  <p className="text-xs text-destructive">{preview.error}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" loading={busy} disabled={"error" in preview} onClick={apply}>
                  <Check className="size-4" />
                  Apply to dataset
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPending(null)}>
                  <X className="size-4" />
                  Discard
                </Button>
              </div>
            </div>

            {"outcome" in preview ? (
              preview.outcome.grid.rows.length === 0 ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  This operation leaves no rows. Applying it empties the dataset, which History can roll back.
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    First {Math.min(PREVIEW_ROWS, preview.outcome.grid.rows.length)} row
                    {preview.outcome.grid.rows.length === 1 ? "" : "s"} after applying:
                  </p>
                  <DataTable
                    className="h-48"
                    showRowNumbers
                    columns={preview.outcome.grid.columns.map((column) => column.name)}
                    rows={preview.outcome.grid.rows.slice(0, PREVIEW_ROWS)}
                  />
                </div>
              )
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {appliedCount > 0
              ? `${appliedCount} operation${appliedCount === 1 ? "" : "s"} applied. The Grid tab shows the result, and History can roll any of them back.`
              : "Build an operation above — nothing is recorded until you review its effect and apply it."}
          </p>
        )}
      </div>
    </Section>
  )
}
