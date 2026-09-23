"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Database, Plus } from "lucide-react"

import { EmptyState, LoadingCard, PageHeader } from "@/components/common"
import { ConnectionCreateDialog } from "@/components/connections/connection-create-dialog"
import { ConnectionEditor } from "@/components/connections/connection-editor"
import { ConnectionExplorer } from "@/components/connections/connection-explorer"
import { ConnectionList } from "@/components/connections/connection-list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConnectionStorage } from "@/lib/storage"
import { toast } from "@/lib/toast"
import type { DatabaseConfig } from "@/lib/types"

/**
 * Saved profiles live in localStorage, so they can only be read once the page
 * is on the client. Everything the page shows is derived from that one read;
 * every action writes through `ConnectionStorage` and re-reads it here.
 */
export default function ConnectionsPage() {
  const [connections, setConnections] = useState<DatabaseConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [explorerKey, setExplorerKey] = useState(0)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<DatabaseConfig | null>(null)
  const knownIds = useRef<ReadonlySet<string>>(new Set<string>())

  const refresh = useCallback(() => {
    setConnections(ConnectionStorage.sortForDisplay(ConnectionStorage.getAll()))
  }, [])

  useEffect(() => {
    refresh()
    setLoading(false)
  }, [refresh])

  /** A deleted profile takes the selection with it, so the next one steps in. */
  useEffect(() => {
    if (connections.length === 0) {
      setSelectedId(null)
      return
    }
    if (!connections.some((connection) => connection.id === selectedId)) {
      setSelectedId(connections[0].id)
    }
  }, [connections, selectedId])

  const selected = useMemo(
    () => connections.find((connection) => connection.id === selectedId) ?? null,
    [connections, selectedId],
  )

  /** Switching profiles starts the explorer over: its tables belong to one profile. */
  const handleSelect = useCallback((id: string) => {
    setSelectedId(id)
    setExplorerKey((value) => value + 1)
  }, [])

  /** Opening a profile is what reorders the list by last use. */
  const handleUsed = useCallback(
    (id: string) => {
      ConnectionStorage.markUsed(id)
      refresh()
    },
    [refresh],
  )

  const openCreate = useCallback(() => {
    knownIds.current = new Set(connections.map((connection) => connection.id))
    setCreating(true)
  }, [connections])

  /** The shared form reports the whole list; the new profile is the unknown id in it. */
  const handleCreated = useCallback(
    (saved: DatabaseConfig[]) => {
      const created = saved.find((connection) => !knownIds.current.has(connection.id))
      setConnections(ConnectionStorage.sortForDisplay(saved))
      setCreating(false)

      if (created) {
        setSelectedId(created.id)
        setExplorerKey((value) => value + 1)
        toast.success(`"${created.name}" saved`, "The profile is kept in this browser.")
      }
    },
    [],
  )

  const handleSavedEdit = useCallback(() => {
    setEditing(null)
    refresh()
    // Host, database or credentials may have changed, so the explorer re-reads.
    setExplorerKey((value) => value + 1)
  }, [refresh])

  return (
    <div className="text-foreground">
      <PageHeader
        title="Connections"
        description="Saved database profiles, and what is inside each one"
        badge={connections.length > 0 ? <Badge variant="outline">{connections.length} saved</Badge> : null}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus />
            New connection
          </Button>
        }
      />

      <main className="w-full space-y-6 px-6 py-8">
        {loading ? (
          <LoadingCard label="Reading saved connections" hint="Profiles are stored in this browser." />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
            <ConnectionList
              connections={connections}
              selectedId={selectedId}
              onSelect={handleSelect}
              onNew={openCreate}
              onEdit={setEditing}
              onChanged={refresh}
            />

            <div className="min-w-0">
              {selected ? (
                <ConnectionExplorer
                  key={`${selected.id}:${explorerKey}`}
                  connection={selected}
                  onUsed={handleUsed}
                  onEdit={setEditing}
                />
              ) : (
                <EmptyState
                  icon={<Database />}
                  title={connections.length === 0 ? "No connection to explore" : "No connection selected"}
                  description={
                    connections.length === 0
                      ? "Save a connection with the form on the left, then its tables, queries and snapshots live here."
                      : "Pick a saved connection on the left to see its tables, run a query and manage snapshots."
                  }
                  action={
                    connections.length === 0 ? (
                      <Button size="sm" onClick={openCreate}>
                        <Plus />
                        Add connection
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => handleSelect(connections[0].id)}>
                        Open {connections[0].name}
                      </Button>
                    )
                  }
                />
              )}
            </div>
          </div>
        )}
      </main>

      <ConnectionCreateDialog open={creating} onOpenChange={setCreating} onSaved={handleCreated} />
      <ConnectionEditor
        connection={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        onSaved={handleSavedEdit}
      />
    </div>
  )
}
