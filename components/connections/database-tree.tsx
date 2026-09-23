"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronRight, Database, Loader2, Plus, Table2 } from "lucide-react"

import { StatusAlert } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import type { DatabaseConfig, DatabaseTable } from "@/lib/types"
import { cn } from "@/lib/utils"

interface DatabaseTreeProps {
  /** A connection that can already reach the server; the database is what is being chosen. */
  config: DatabaseConfig
  /** The database that will receive the tables, or null while none is chosen. */
  selected: string | null
  onSelected: (database: string, tables: DatabaseTable[]) => void
}

/**
 * Databases as collapsible nodes, tables inside them.
 *
 * The tree is where a database gets chosen, so changing one never means editing
 * and re-saving a connection. Tables load lazily on expand: a server with a
 * hundred databases should not cost a hundred round trips to draw.
 *
 * A SQLite connection has no server to enumerate — its file *is* the database,
 * so the tree shows one node and reads that file's tables directly.
 */
export function DatabaseTree({ config, selected, onSelected }: DatabaseTreeProps) {
  const [databases, setDatabases] = useState<string[] | null>(null)
  const [tables, setTables] = useState<Record<string, DatabaseTable[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)

  // The config object is recreated by the parent on every render; the fields are
  // what identify the server being talked to.
  const latest = useRef({ config, onSelected })
  latest.current = { config, onSelected }

  const target = [config.id, config.type, config.host, config.port, config.username, config.database].join("|")

  const loadTables = useCallback(async (database: string): Promise<DatabaseTable[] | null> => {
    setBusy(database)
    const result = await api.getTables({ ...latest.current.config, database })
    setBusy(null)

    if (!result.ok) {
      setError(result.error)
      return null
    }

    setTables((previous) => ({ ...previous, [database]: result.data }))
    return result.data
  }, [])

  const select = useCallback(
    async (database: string) => {
      setError(null)
      const loaded = tables[database] ?? (await loadTables(database))
      if (!loaded) return
      setExpanded(database)
      latest.current.onSelected(database, loaded)
    },
    [loadTables, tables],
  )

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setError(null)
      setTables({})
      setExpanded(null)

      if (latest.current.config.type === "sqlite") {
        const file = latest.current.config.database
        setDatabases([file])
        const loaded = await loadTables(file)
        if (!cancelled && loaded) latest.current.onSelected(file, loaded)
        return
      }

      setDatabases(null)
      const result = await api.listDatabases(latest.current.config)
      if (cancelled) return

      if (!result.ok) {
        setDatabases([])
        setError(result.error)
        return
      }

      const sorted = [...result.data].sort((left, right) => left.localeCompare(right))
      setDatabases(sorted)

      // The connection usually already names a database: open on it.
      const preferred = latest.current.config.database
      if (preferred && sorted.includes(preferred)) {
        const loaded = await loadTables(preferred)
        if (!cancelled && loaded) {
          setExpanded(preferred)
          latest.current.onSelected(preferred, loaded)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [loadTables, target])

  const toggle = async (database: string) => {
    if (expanded === database) {
      setExpanded(null)
      return
    }

    setExpanded(database)
    if (!tables[database]) await loadTables(database)
  }

  const createDatabase = async () => {
    const name = newName.trim()
    if (!name) return

    setCreateError(null)

    // A SQLite database is a file: naming it is the whole creation, and the
    // engine writes it the moment something connects to it.
    if (latest.current.config.type === "sqlite") {
      setNewName("")
      setCreating(false)
      setDatabases((previous) => Array.from(new Set([...(previous ?? []), name])))
      void select(name)
      return
    }

    setBusy(name)
    const result = await api.createDatabase(latest.current.config, name)
    setBusy(null)

    if (!result.ok) {
      setCreateError(result.error)
      return
    }

    setNewName("")
    setCreating(false)
    setDatabases((previous) =>
      Array.from(new Set([...(previous ?? []), name])).sort((left, right) => left.localeCompare(right)),
    )
    void select(name)
  }

  return (
    <div className="space-y-3">
      {databases === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Listing databases
        </p>
      ) : null}

      {error ? <StatusAlert tone="error">{error}</StatusAlert> : null}

      {databases !== null && databases.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">
          Nothing found with these credentials. Create a database below.
        </p>
      ) : null}

      <ul className="space-y-1">
        {(databases ?? []).map((database) => {
          const isSelected = selected === database
          const isExpanded = expanded === database
          const rows = tables[database]

          return (
            <li key={database} className={cn("rounded-lg border", isSelected && "border-primary")}>
              <div className="flex items-center gap-2 p-1.5">
                <button
                  type="button"
                  onClick={() => void toggle(database)}
                  aria-expanded={isExpanded}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                >
                  <ChevronRight
                    aria-hidden
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
                      isExpanded && "rotate-90",
                    )}
                  />
                  <Database aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{database}</span>
                  {busy === database ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
                  {rows ? (
                    <span className="text-xs text-muted-foreground">
                      {rows.length} table{rows.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </button>

                {isSelected ? (
                  <Badge variant="outline" className="mr-1.5">
                    Target
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mr-1.5"
                    onClick={() => void select(database)}
                    disabled={busy === database}
                  >
                    Use
                  </Button>
                )}
              </div>

              {isExpanded ? (
                <ul className="space-y-0.5 border-t px-2 py-2">
                  {rows === undefined ? (
                    <li className="px-2 py-1 text-xs text-muted-foreground">Reading tables</li>
                  ) : rows.length === 0 ? (
                    <li className="px-2 py-1 text-xs text-muted-foreground">
                      No tables yet — this import would create the first one.
                    </li>
                  ) : (
                    rows.map((table) => (
                      <li key={table.name} className="flex items-center gap-2 px-2 py-1">
                        <Table2 aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate font-mono text-xs">{table.name}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {table.rowCount === undefined ? "" : `${table.rowCount.toLocaleString()} rows`}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>

      {creating ? (
        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <p className="text-sm font-medium">
            {config.type === "sqlite" ? "New SQLite file" : "New database on this server"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void createDatabase()
              }}
              placeholder={config.type === "sqlite" ? "ingesta.db" : "new_database"}
              aria-label={config.type === "sqlite" ? "New SQLite file name" : "New database name"}
              className="min-w-40 flex-1"
            />
            <Button onClick={() => void createDatabase()} disabled={newName.trim() === "" || busy !== null}>
              Create
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setCreating(false)
                setNewName("")
                setCreateError(null)
              }}
            >
              Cancel
            </Button>
          </div>
          {createError ? <StatusAlert tone="error">{createError}</StatusAlert> : null}
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
          <Plus />
          {config.type === "sqlite" ? "New SQLite file" : "New database"}
        </Button>
      )}
    </div>
  )
}
