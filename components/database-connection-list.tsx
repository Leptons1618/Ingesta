"use client"

import { useState } from "react"
import { Database, Eye, Loader2, Trash2 } from "lucide-react"

import { EmptyState, StatusAlert } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { postJson } from "@/lib/api"
import { ConnectionStorage } from "@/lib/storage"
import type { DatabaseConfig, DatabaseTable } from "@/lib/types"

interface DatabaseConnectionListProps {
  connections: DatabaseConfig[]
  onRemoved: (connections: DatabaseConfig[]) => void
  onSelected: (config: DatabaseConfig, tables: DatabaseTable[]) => void
}

export function DatabaseConnectionList({ connections, onRemoved, onSelected }: DatabaseConnectionListProps) {
  const [loadingTables, setLoadingTables] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSelectConnection = async (config: DatabaseConfig) => {
    setLoadingTables(config.id)
    setError(null)

    try {
      const response = await postJson<{ tables: DatabaseTable[] }>("/api/get-tables", config)

      if (!response.ok) {
        setError(response.error)
        return
      }

      // A connection with no tables is still usable: that is where new tables go.
      onSelected(config, response.data.tables)
    } finally {
      setLoadingTables(null)
    }
  }

  const handleRemoveConnection = (id: string) => {
    ConnectionStorage.remove(id)
    onRemoved(ConnectionStorage.getAll())
  }

  if (connections.length === 0) {
    return (
      <EmptyState
        icon={<Database className="h-12 w-12" />}
        title="No saved connections"
        description="Add a connection to choose where the tables go."
      />
    )
  }

  return (
    <div className="space-y-4">
      <Card className="card-shell">
        <CardHeader>
          <CardTitle className="text-lg">Saved connections</CardTitle>
          <CardDescription>Select a connection to choose the database for your new tables.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connections.map((connection) => (
            <div
              key={connection.id}
              className="flex flex-col gap-4 rounded-xl border border-border bg-muted/20 p-4 transition-colors hover:bg-muted/35 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-lg bg-muted p-2 text-muted-foreground">
                  <Database className="h-5 w-5" />
                </div>

                <div>
                  <h4 className="font-semibold text-foreground">{connection.name}</h4>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {connection.type.toUpperCase()}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{connection.database}</span>
                    {connection.host ? (
                      <span className="text-sm text-muted-foreground">
                        @ {connection.host}:{connection.port}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSelectConnection(connection)}
                  disabled={loadingTables === connection.id}
                >
                  {loadingTables === connection.id ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4 mr-2" />
                      Select
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemoveConnection(connection.id)}
                  className="text-destructive hover:text-destructive"
                  aria-label={`Remove ${connection.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {error ? <StatusAlert tone="error">{error}</StatusAlert> : null}
    </div>
  )
}
