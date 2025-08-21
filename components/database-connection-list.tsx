"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Database, Trash2, AlertCircle, Loader2, Eye } from "lucide-react"
import { type DatabaseConfig, DatabaseManager, type DatabaseTable } from "@/lib/database-manager"

interface DatabaseConnectionListProps {
  connections: DatabaseConfig[]
  onConnectionRemoved: (id: string) => void
  onConnectionSelected: (config: DatabaseConfig, tables: DatabaseTable[]) => void
}

export function DatabaseConnectionList({
  connections,
  onConnectionRemoved,
  onConnectionSelected,
}: DatabaseConnectionListProps) {
  const [loadingTables, setLoadingTables] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSelectConnection = async (config: DatabaseConfig) => {
    setLoadingTables(config.id)
    setError(null)

    try {
      const tables = await DatabaseManager.getTables(config)
      onConnectionSelected(config, tables)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load database tables")
    } finally {
      setLoadingTables(null)
    }
  }

  const handleRemoveConnection = (id: string) => {
    DatabaseManager.removeConnection(id)
    onConnectionRemoved(id)
  }

  const getDatabaseIcon = (type: string) => {
    const colors = {
      mysql: "text-orange-500",
      postgresql: "text-blue-500",
      sqlite: "text-green-500",
      mssql: "text-red-500",
    }
    return colors[type as keyof typeof colors] || "text-gray-500"
  }

  if (connections.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Database className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No Database Connections</h3>
          <p className="text-sm text-muted-foreground text-center">
            Add a database connection to start mapping your Excel data to database tables.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Saved Connections</CardTitle>
          <CardDescription>Select a database connection to proceed with data mapping</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connections.map((connection) => (
            <div
              key={connection.id}
              className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-lg bg-muted ${getDatabaseIcon(connection.type)}`}>
                  <Database className="w-5 h-5" />
                </div>

                <div>
                  <h4 className="font-semibold text-foreground">{connection.name}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {connection.type.toUpperCase()}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{connection.database}</span>
                    {connection.host && (
                      <span className="text-sm text-muted-foreground">
                        @ {connection.host}:{connection.port}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleSelectConnection(connection)}
                  disabled={loadingTables === connection.id}
                >
                  {loadingTables === connection.id ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 mr-2" />
                      Select
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemoveConnection(connection.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {error && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
