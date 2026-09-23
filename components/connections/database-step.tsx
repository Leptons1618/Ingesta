"use client"

import { useState } from "react"
import { ChevronRight, Database, Plus, Star, Trash2 } from "lucide-react"

import { EmptyState, StatusAlert } from "@/components/common"
import { ConnectionCreateDialog } from "@/components/connections/connection-create-dialog"
import { DatabaseTree } from "@/components/connections/database-tree"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConnectionStorage } from "@/lib/storage"
import type { DatabaseConfig, DatabaseTable } from "@/lib/types"
import { cn, formatRelativeTime } from "@/lib/utils"

interface DatabaseStepProps {
  connections: DatabaseConfig[]
  onConnectionsChanged: (connections: DatabaseConfig[]) => void
  /** Called with the connection *and* the database chosen in the tree. */
  onComplete: (config: DatabaseConfig, tables: DatabaseTable[]) => void
}

/** Where a saved connection points, in one line. */
function describeTarget(connection: DatabaseConfig): string {
  if (connection.type === "sqlite") return connection.database
  const host = connection.host ?? "localhost"
  const port = connection.port ? `:${connection.port}` : ""
  return `${host}${port} · ${connection.database}`
}

/**
 * Step 3: pick a connection, then pick the database in the tree.
 *
 * Choosing a connection no longer *is* the step — it opens the tree, and the
 * database is chosen there, so changing the target does not mean editing and
 * re-saving a profile. Creating a connection is an explicit action (the dialog),
 * not a form permanently occupying half the screen.
 */
export function DatabaseStep({ connections, onConnectionsChanged, onComplete }: DatabaseStepProps) {
  const [active, setActive] = useState<DatabaseConfig | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedDatabase, setSelectedDatabase] = useState<string | null>(null)
  const [tables, setTables] = useState<DatabaseTable[]>([])

  const ordered = ConnectionStorage.sortForDisplay(connections)

  const choose = (connection: DatabaseConfig) => {
    setActive(connection)
    setSelectedDatabase(null)
    setTables([])
  }

  const remove = (connection: DatabaseConfig) => {
    ConnectionStorage.remove(connection.id)
    const remaining = ConnectionStorage.getAll()
    onConnectionsChanged(remaining)

    if (active?.id === connection.id) {
      setActive(remaining[0] ?? null)
      setSelectedDatabase(null)
      setTables([])
    }
  }

  const proceed = () => {
    if (!active || !selectedDatabase) return
    ConnectionStorage.markUsed(active.id)
    onConnectionsChanged(ConnectionStorage.getAll())
    onComplete({ ...active, database: selectedDatabase }, tables)
  }

  return (
    <div className="space-y-6">
      <Card className="card-shell">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Connection</CardTitle>
              <CardDescription>
                Pick a saved connection, or create one. Nothing is written to the server.
              </CardDescription>
            </div>
            {connections.length > 0 ? (
              <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus />
                New connection
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {connections.length === 0 ? (
            <EmptyState
              icon={<Database />}
              title="No saved connections"
              description="A connection is saved in this browser only. Create one to browse its databases and tables."
              action={
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus />
                  Create connection
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {ordered.map((connection) => {
                const isActive = active?.id === connection.id
                return (
                  <li key={connection.id} className="flex items-stretch gap-2">
                    <button
                      type="button"
                      onClick={() => choose(connection)}
                      aria-pressed={isActive}
                      className={cn(
                        "flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                        isActive ? "border-primary bg-primary/8" : "hover:bg-muted/40",
                      )}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <Database aria-hidden className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-medium">{connection.name}</span>
                          {connection.favorite ? (
                            <Star aria-label="Pinned" className="size-3.5 shrink-0 text-amber-500" />
                          ) : null}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-xs">
                            {connection.type.toUpperCase()}
                          </Badge>
                          <span className="truncate font-mono">{describeTarget(connection)}</span>
                          {connection.lastUsedAt ? <span>used {formatRelativeTime(connection.lastUsedAt)}</span> : null}
                        </span>
                      </span>
                      {isActive ? <Badge variant="outline">Open</Badge> : null}
                    </button>

                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => remove(connection)}
                      aria-label={`Remove ${connection.name}`}
                      className="h-auto text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {active ? (
        <Card className="card-shell">
          <CardHeader>
            <CardTitle className="text-lg">Database</CardTitle>
            <CardDescription>
              Expand a database to see its tables, then choose the one the new tables go into.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DatabaseTree
              key={active.id}
              config={active}
              selected={selectedDatabase}
              onSelected={(database, loadedTables) => {
                setSelectedDatabase(database)
                setTables(loadedTables)
              }}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="text-xs text-muted-foreground">
                {selectedDatabase
                  ? `Tables will be created in ${selectedDatabase}.`
                  : "Choose a database to continue."}
              </p>
              <Button onClick={proceed} disabled={!selectedDatabase}>
                Continue to sheets
                <ChevronRight />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : connections.length > 0 ? (
        <StatusAlert tone="info">
          Select a connection above to list its databases and tables.
        </StatusAlert>
      ) : null}

      <ConnectionCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={(saved) => {
          onConnectionsChanged(saved)
          // The profile that was just saved is the one the user wants to use.
          const newest = saved[saved.length - 1]
          if (newest) choose(newest)
        }}
      />
    </div>
  )
}
