"use client"

import { useEffect, useState } from "react"

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { GuardrailAssessment } from "@/lib/types"
import { cn } from "@/lib/utils"

import { RiskBadge } from "./risk-badge"

/**
 * The guardrail gate. When the assessment carries a confirmation phrase the
 * confirm button stays disabled until the phrase is typed exactly, which is the
 * only way a destructive action is allowed through.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  assessment,
  onConfirm,
  confirmLabel = "Confirm",
  busy = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  assessment: GuardrailAssessment
  onConfirm: () => void
  confirmLabel?: string
  busy?: boolean
}) {
  const [typed, setTyped] = useState("")

  // Each time the dialog opens the gate is re-armed, so a phrase typed for a
  // previous assessment can never satisfy the next one.
  useEffect(() => {
    if (open) setTyped("")
  }, [open, assessment.confirmation])

  const phrase = assessment.confirmation
  const unlocked = phrase ? typed.trim() === phrase : true

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <RiskBadge risk={assessment.risk} />
          </div>
          <AlertDialogTitle>{assessment.title}</AlertDialogTitle>
          <AlertDialogDescription>{assessment.summary}</AlertDialogDescription>
        </AlertDialogHeader>

        {assessment.warnings.length > 0 ? (
          <ul className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            {assessment.warnings.map((warning, index) => (
              <li key={index} className="flex gap-2">
                <span aria-hidden className="text-muted-foreground">
                  &bull;
                </span>
                <span className="min-w-0">{warning}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {phrase ? (
          <div className="space-y-2">
            <Label htmlFor="confirm-phrase" className="text-sm font-normal">
              Type <span className="font-mono font-semibold">{phrase}</span> to continue
            </Label>
            <Input
              id="confirm-phrase"
              value={typed}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              onChange={(event) => setTyped(event.target.value)}
              className={cn("font-mono", unlocked && "border-emerald-500/60")}
            />
          </div>
        ) : null}

        <AlertDialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={assessment.risk === "destructive" ? "destructive" : "default"}
            disabled={!unlocked}
            loading={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
