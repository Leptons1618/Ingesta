"use client"

import { useCallback, useState } from "react"
import type { ReactNode } from "react"

import { ConfirmDialog, RiskBadge } from "@/components/common"
import { useAppSettingsStore } from "@/lib/settings"
import type { GuardrailAssessment } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface GuardrailRequest {
  assessment: GuardrailAssessment
  confirmLabel: string
  /** Runs only after the dialog is satisfied. */
  run: () => void | Promise<void>
}

/** Rendered while no gate is open, so the dialog's props never need a null check. */
const IDLE: GuardrailAssessment = { risk: "safe", title: "", summary: "", warnings: [] }

/**
 * `lib/guardrails.ts` always attaches the phrase a destructive assessment asks
 * for. Whether the user actually has to type it is a setting, so the phrase is
 * dropped here and not in the dialog: the dialog stays the one enforcement
 * point, and turning the setting off removes the typing step without removing
 * the warning that comes with it.
 */
function phraseFor(assessment: GuardrailAssessment, requireTyped: boolean): GuardrailAssessment {
  if (requireTyped || !assessment.confirmation) return assessment
  return { ...assessment, confirmation: undefined }
}

/**
 * The one gate every destruction on this page passes through: `ask` names the
 * assessment and the work, `gate` renders the dialog that guards it.
 */
export function useGuardrailConfirm(): {
  ask: (request: GuardrailRequest) => void
  gate: ReactNode
  busy: boolean
} {
  const requireTyped = useAppSettingsStore((state) => state.guardrails.requireTypedConfirmation)
  const [pending, setPending] = useState<GuardrailRequest | null>(null)
  const [busy, setBusy] = useState(false)

  const ask = useCallback((request: GuardrailRequest) => setPending(request), [])

  const handleConfirm = useCallback(async () => {
    if (!pending) return
    setBusy(true)
    try {
      await pending.run()
    } finally {
      setBusy(false)
      setPending(null)
    }
  }, [pending])

  const gate = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null)
      }}
      assessment={pending ? phraseFor(pending.assessment, requireTyped) : IDLE}
      confirmLabel={pending?.confirmLabel ?? "Confirm"}
      busy={busy}
      onConfirm={handleConfirm}
    />
  )

  return { ask, gate, busy }
}

/**
 * The guardrail verdict as inline text. Used where a dialog would be too heavy —
 * the live SQL verdict, and forms that carry their own submit button.
 */
export function AssessmentNote({
  assessment,
  blockedReason,
  className,
}: {
  assessment: GuardrailAssessment
  /** Shown verbatim, above everything else, when the action cannot run at all. */
  blockedReason?: string
  className?: string
}) {
  return (
    <div className={cn("space-y-2 rounded-lg border border-border bg-muted/30 p-3", className)}>
      <div className="flex items-center gap-2">
        <RiskBadge risk={assessment.risk} />
        <span className="text-sm font-medium">{assessment.title}</span>
      </div>

      {blockedReason ? (
        <p className="font-mono text-xs text-destructive">{blockedReason}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{assessment.summary}</p>
      )}

      {assessment.warnings.length > 0 ? (
        <ul className="space-y-1">
          {assessment.warnings.map((warning) => (
            <li key={warning} className="flex gap-2 text-xs text-muted-foreground">
              <span aria-hidden>&bull;</span>
              <span className="min-w-0">{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
