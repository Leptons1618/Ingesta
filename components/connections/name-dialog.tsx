"use client"

import { useEffect, useState } from "react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface NameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  label: string
  initialValue: string
  submitLabel: string
  /** The verdict for the name as it is being typed; the user sees it before submitting. */
  renderNote?: (value: string) => ReactNode
  /** Resolves when the rename succeeded; a failure keeps the dialog open. */
  onSubmit: (value: string) => void | Promise<void>
}

/**
 * One place asking for a name, where the guardrail verdict is rendered from the
 * value being typed rather than from the value it started with. It closes only
 * when `onSubmit` resolves, so a rejected name stays editable.
 */
export function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  initialValue,
  submitLabel,
  renderNote,
  onSubmit,
}: NameDialogProps) {
  const [value, setValue] = useState(initialValue)
  const [busy, setBusy] = useState(false)

  // Re-seeded on open so a cancelled name never reappears in the next dialog.
  useEffect(() => {
    if (open) {
      setValue(initialValue)
      setBusy(false)
    }
  }, [open, initialValue])

  const trimmed = value.trim()
  const canSubmit = trimmed.length > 0 && trimmed !== initialValue && !busy

  const handleSubmit = async () => {
    if (!canSubmit) return
    setBusy(true)
    try {
      await onSubmit(trimmed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="dialog-name">{label}</Label>
            <Input
              id="dialog-name"
              value={value}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleSubmit()
              }}
            />
          </div>

          {renderNote ? renderNote(trimmed) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!canSubmit} onClick={() => void handleSubmit()}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
