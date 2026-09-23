"use client"

import { CheckCheck, Loader2, Trash2, X } from "lucide-react"

import { RiskBadge, Section } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { assessPending, mergeAssessments, pendingCount, pendingEntries, type PendingChanges } from "./pending-changes"

/**
 * The review gate. Every edit is listed with its family, the merged guardrail
 * verdict is shown before the button is pressed, and nothing is written until
 * "Apply to database" is confirmed.
 */
export function PendingPanel({
  pending,
  table,
  primaryKey,
  totalRows,
  busy,
  onDiscard,
  onApply,
  onRemoveEntry,
}: {
  pending: PendingChanges
  table: string
  primaryKey: string | null
  totalRows: number
  busy: boolean
  onDiscard: () => void
  onApply: () => void
  onRemoveEntry: (id: string) => void
}) {
  const count = pendingCount(pending)
  const entries = pendingEntries(pending, table, primaryKey)
  const risk = count > 0 ? mergeAssessments(assessPending(pending, table, totalRows), table, count).risk : "safe"
  const families = [...new Set(entries.map((entry) => entry.family))]

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          Pending changes
          <Badge variant={count > 0 ? "default" : "outline"}>{count}</Badge>
        </span>
      }
      description="Held in the browser until you apply them. The database is untouched until then."
      actions={
        <>
          {count > 0 ? <RiskBadge risk={risk} /> : null}
          <Button variant="outline" size="sm" onClick={onDiscard} disabled={count === 0 || busy}>
            <X className="h-4 w-4" />
            Discard all
          </Button>
          <Button size="sm" onClick={onApply} disabled={count === 0 || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            Apply to database
          </Button>
        </>
      }
    >
      {count === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nothing pending. Edit a cell, delete a row, add a row, or change a column to start a plan.
        </p>
      ) : (
        <div className="space-y-4">
          {families.map((family) => (
            <div key={family} className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{family}</p>
              <ul className="space-y-1.5">
                {entries
                  .filter((entry) => entry.family === family)
                  .map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{entry.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{entry.detail}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${entry.title}`}
                        className="size-7 shrink-0 text-muted-foreground"
                        onClick={() => onRemoveEntry(entry.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}
