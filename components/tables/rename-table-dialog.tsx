"use client"

import { useState } from "react"
import { Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

/**
 * A rename is recorded as a pending change rather than run here, so it travels
 * through the same guardrail and the same confirm dialog as every other edit.
 */
export function RenameTableDialog({
  open,
  onOpenChange,
  table,
  onRename,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  table: string
  onRename: (to: string) => void
}) {
  const [name, setName] = useState(table)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename table</DialogTitle>
          <DialogDescription>
            Anything pointing at “{table}” — views, saved queries, other tools — breaks when the table is renamed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="table-studio-rename">
            New name
          </label>
          <Input id="table-studio-rename" value={name} onChange={(event) => setName(event.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || name.trim() === table}
            onClick={() => {
              onRename(name.trim())
              onOpenChange(false)
            }}
          >
            <Pencil className="h-4 w-4" />
            Add to plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
