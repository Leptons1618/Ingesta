"use client"

import { DatabaseConnectionForm } from "@/components/database-connection-form"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { DatabaseConfig } from "@/lib/types"

interface ConnectionCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Receives the full saved list, exactly as the shared form reports it. */
  onSaved: (connections: DatabaseConfig[]) => void
}

/**
 * Creation keeps using the shared `DatabaseConnectionForm` — it already tests
 * before saving, lists server databases and can create one, and the import
 * wizard depends on it behaving the same way here.
 */
export function ConnectionCreateDialog({ open, onOpenChange, onSaved }: ConnectionCreateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New connection</DialogTitle>
          <DialogDescription>
            Test the credentials, then save them to this browser. Nothing is written to the server.
          </DialogDescription>
        </DialogHeader>

        <DatabaseConnectionForm
          onSaved={(connections) => {
            onSaved(connections)
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
