"use client"

import { Loader2, RefreshCw } from "lucide-react"

import { ConnectionSelect } from "@/components/connection-select"
import { Section } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { DatabaseConfig, DatabaseTable } from "@/lib/types"

/**
 * The one place a database target is chosen. It holds no state of its own: the
 * page owns the selection so a re-fetch and a table switch cannot disagree.
 */
export function SelectionBar({
  connections,
  connection,
  onConnectionChange,
  tables,
  tableName,
  onTableChange,
  loading,
  onRefresh,
}: {
  connections: DatabaseConfig[]
  connection: DatabaseConfig | null
  onConnectionChange: (config: DatabaseConfig | null) => void
  tables: DatabaseTable[]
  tableName: string | null
  onTableChange: (name: string) => void
  loading: boolean
  onRefresh: () => void
}) {
  return (
    <Section
      title="Target"
      description="Pull a live table into the browser, then apply your edits back to it."
      actions={
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading || !connection}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="table-studio-connection">
            Connection
          </label>
          <ConnectionSelect
            connections={connections}
            value={connection?.id ?? null}
            onChange={onConnectionChange}
            placeholder={connections.length === 0 ? "No saved connections" : "Select a connection"}
            id="table-studio-connection"
            ariaLabel="Connection"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="table-studio-table">
            Table
          </label>
          <Select value={tableName ?? undefined} onValueChange={onTableChange} disabled={tables.length === 0}>
            <SelectTrigger id="table-studio-table" className="w-full">
              <SelectValue placeholder={tables.length === 0 ? "No tables in this database" : "Select a table"} />
            </SelectTrigger>
            <SelectContent>
              {tables.map((table) => (
                <SelectItem key={table.name} value={table.name}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{table.name}</span>
                    {table.rowCount !== undefined ? (
                      <span className="shrink-0 text-xs text-muted-foreground">{table.rowCount.toLocaleString()} rows</span>
                    ) : null}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </Section>
  )
}
