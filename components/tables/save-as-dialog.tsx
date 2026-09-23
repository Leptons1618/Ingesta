"use client"

import { useState } from "react"
import { Database, Save } from "lucide-react"

import { ChipButton } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { PushMode } from "@/lib/push"
import type { DatabaseTable } from "@/lib/types"

const MODES: Array<{ value: PushMode; label: string; description: string }> = [
  { value: "create", label: "New table", description: "Create a table and write the rows into it." },
  { value: "append", label: "Append", description: "Add the rows to the end of a table that exists." },
  { value: "replace", label: "Replace", description: "Empty an existing table, then write the rows." },
]

/**
 * Writes the page you are looking at into another table. The write itself runs
 * through `pushGrid` behind the guardrail dialog, not from here.
 */
export function SaveAsDialog({
  open,
  onOpenChange,
  tables,
  rowCount,
  busy,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tables: DatabaseTable[]
  rowCount: number
  busy: boolean
  onSave: (target: string, mode: PushMode) => void
}) {
  const [mode, setMode] = useState<PushMode>("create")
  const [target, setTarget] = useState("")

  const selected = MODES.find((entry) => entry.value === mode) ?? MODES[0]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save as</DialogTitle>
          <DialogDescription>
            Writes the {rowCount.toLocaleString()} row{rowCount === 1 ? "" : "s"} currently on screen — pending edits
            included — into another table on this connection.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {MODES.map((entry) => (
              <ChipButton key={entry.value} selected={entry.value === mode} onClick={() => setMode(entry.value)}>
                {entry.label}
              </ChipButton>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{selected.description}</p>

          {mode === "create" ? (
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="table-studio-save-as-name">
                New table name
              </label>
              <Input
                id="table-studio-save-as-name"
                value={target}
                placeholder="orders_cleaned"
                onChange={(event) => setTarget(event.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="table-studio-save-as-target">
                Target table
              </label>
              <Select value={target || undefined} onValueChange={setTarget}>
                <SelectTrigger id="table-studio-save-as-target" className="w-full">
                  <SelectValue placeholder="Select a table" />
                </SelectTrigger>
                <SelectContent>
                  {tables.map((table) => (
                    <SelectItem key={table.name} value={table.name}>
                      <span className="flex min-w-0 items-center gap-2">
                        <Database className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{table.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !target.trim()} onClick={() => onSave(target.trim(), mode)}>
            <Save className="h-4 w-4" />
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
