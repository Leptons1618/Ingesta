"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Camera, Copy, Database, KeyRound, Pencil, PlugZap, RefreshCw, Table2, Terminal } from "lucide-react"

import { EmptyState, LoadingCard, Section, StatCard, StatGrid, StatusAlert } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/lib/api"
import { ConnectionStorage } from "@/lib/storage"
import { toast } from "@/lib/toast"
import type { ConnectionTestResult, DatabaseConfig, DatabaseTable } from "@/lib/types"
import { cn, formatRelativeTime } from "@/lib/utils"

import { QueryConsole } from "./query-console"
import { SnapshotsPanel } from "./snapshots-panel"
import { TableBrowser } from "./table-browser"

interface ConnectionExplorerProps {
  connection: DatabaseConfig
  /** The profile answered a request, so it counts as opened. */
  onUsed: (id: string) => void
  onEdit: (connection: DatabaseConfig) => void
}

const TABS = [
  { value: "overview", label: "Overview", icon: Database },
  { value: "tables", label: "Tables", icon: Table2 },
  { value: "query", label: "Query", icon: Terminal },
  { value: "snapshots", label: "Snapshots", icon: Camera },
] as const

/** Right column: everything that can be done with one saved connection. */
export function ConnectionExplorer({ connection, onUsed, onEdit }: ConnectionExplorerProps) {
  const [tab, setTab] = useState<string>("overview")
  const [tables, setTables] = useState<DatabaseTable[] | null>(null)
  const [tablesError, setTablesError] = useState<string | null>(null)
  const [loadingTables, setLoadingTables] = useState(true)
  const [tablesReload, setTablesReload] = useState(0)
  const [activeTable, setActiveTable] = useState<string | null>(null)

  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [testing, setTesting] = useState(false)

  // Effects are keyed on the id: the page refreshes the connection list after
  // every saved change, which hands over a new object for the same profile.
  const config = useRef(connection)
  config.current = connection

  const loadTables = useCallback(async () => {
    setLoadingTables(true)
    setTablesError(null)

    const response = await api.getTables(config.current)
    if (!response.ok) {
      setTables(null)
      setTablesError(response.error)
    } else {
      setTables(response.data)
      setActiveTable((current) => (current && response.data.some((table) => table.name === current) ? current : null))
    }
    setLoadingTables(false)
  }, [])

  useEffect(() => {
    void loadTables()
  }, [connection.id, tablesReload, loadTables])

  const runTest = useCallback(async () => {
    setTesting(true)
    const response = await api.testConnection(config.current)
    setTesting(false)

    if (!response.ok) {
      setTestResult({ success: false, message: response.error })
      return
    }

    setTestResult(response.data)
    if (response.data.success) onUsed(connection.id)
  }, [connection.id, onUsed])

  // One test per selected profile: it is what reorders the list by last use.
  useEffect(() => {
    void runTest()
  }, [connection.id, runTest])

  const selectedTable = useMemo(
    () => tables?.find((table) => table.name === activeTable) ?? null,
    [activeTable, tables],
  )

  const connectionString = useMemo(() => ConnectionStorage.connectionString(connection), [connection])

  const handleCopyString = async () => {
    try {
      await navigator.clipboard.writeText(connectionString)
      toast.success("Connection string copied", "It contains the stored password.")
    } catch {
      toast.error("Could not copy", "The clipboard is not available in this browser.")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-tight">{connection.name}</h2>
            <Badge variant="outline" className="text-xs">
              {connection.type.toUpperCase()}
            </Badge>
            {connection.favorite ? <Badge className="text-xs">Pinned</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {connection.host ? `${connection.host}:${connection.port ?? ""} · ` : ""}
            {connection.database}
          </p>
        </div>

        <Button size="sm" variant="outline" onClick={() => onEdit(connection)}>
          <Pencil />
          Edit profile
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start sm:w-auto">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <Section
            title="Overview"
            description="What this profile reports about the server it points at."
            actions={
              <Button size="sm" variant="outline" loading={testing} onClick={() => void runTest()}>
                {testing ? null : <PlugZap />}
                Re-test
              </Button>
            }
          >
            <div className="space-y-4">
              <StatGrid>
                <StatCard
                  label="Server"
                  value={testResult?.details?.serverVersion ?? "—"}
                  icon={<Database className="size-4" />}
                  hint={testResult ? (testResult.success ? "responded" : "refused") : "not tested"}
                />
                <StatCard
                  label="Database"
                  value={testResult?.details?.databaseName ?? connection.database}
                  icon={<Table2 className="size-4" />}
                />
                <StatCard
                  label="Tables"
                  value={testResult?.details?.tablesCount ?? tables?.length ?? 0}
                  icon={<Table2 className="size-4" />}
                />
                <StatCard
                  label="Last used"
                  value={connection.lastUsedAt ? formatRelativeTime(connection.lastUsedAt) : "never"}
                  icon={<PlugZap className="size-4" />}
                />
              </StatGrid>

              {testResult && !testResult.success ? (
                <StatusAlert tone="error">{testResult.message}</StatusAlert>
              ) : null}

              {testResult?.success ? (
                <StatusAlert tone="success">{testResult.message}</StatusAlert>
              ) : null}

              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <KeyRound className="size-4" />
                  Connection string
                </p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
                    {connectionString || "This database type has no connection string."}
                  </code>
                  <Button size="sm" variant="outline" disabled={!connectionString} onClick={() => void handleCopyString()}>
                    <Copy />
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The string includes the stored password, so treat it as a secret.
                </p>
              </div>
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="tables">
          <Section
            title="Tables"
            description="Pick a table to page through its rows. Every page is read from the server."
            actions={
              <Button size="sm" variant="outline" loading={loadingTables} onClick={() => setTablesReload((value) => value + 1)}>
                {loadingTables ? null : <RefreshCw />}
                Refresh
              </Button>
            }
          >
            {tablesError ? (
              <StatusAlert tone="error">{tablesError}</StatusAlert>
            ) : loadingTables && tables === null ? (
              <LoadingCard label="Reading tables" hint="Asking the server for its table list." />
            ) : tables && tables.length === 0 ? (
              <EmptyState
                icon={<Table2 />}
                title="This database has no tables"
                description="Import a workbook or create a table, then it shows up here."
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                <ul className="max-h-[560px] space-y-1 overflow-y-auto pr-1">
                  {(tables ?? []).map((table) => (
                    <li key={table.name}>
                      <button
                        type="button"
                        onClick={() => setActiveTable(table.name)}
                        aria-current={table.name === activeTable}
                        className={cn(
                          "w-full cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors",
                          table.name === activeTable
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/40",
                        )}
                      >
                        <span className="block truncate font-mono text-sm">{table.name}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {table.columns.length} columns
                          {table.rowCount === undefined ? "" : ` · ${table.rowCount.toLocaleString()} rows`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="min-w-0">
                  {selectedTable ? (
                    <TableBrowser
                      // Keyed per table so paging and sorting start clean for each one.
                      key={selectedTable.name}
                      connection={connection}
                      table={selectedTable}
                      reloadToken={tablesReload}
                      onTablesChanged={() => setTablesReload((value) => value + 1)}
                      onTableGone={() => {
                        setActiveTable(null)
                        setTablesReload((value) => value + 1)
                      }}
                      onTableRenamed={(to) => {
                        setActiveTable(to)
                        setTablesReload((value) => value + 1)
                      }}
                    />
                  ) : (
                    <EmptyState
                      icon={<Table2 />}
                      title="No table selected"
                      description="Choose a table on the left to browse its rows and open its actions."
                    />
                  )}
                </div>
              </div>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="query" forceMount className="data-[state=inactive]:hidden">
          <Section title="Query" description="Run one statement and read the result here.">
            <QueryConsole connection={connection} onUsed={onUsed} />
          </Section>
        </TabsContent>

        <TabsContent value="snapshots">
          <Section title="Snapshots" description="Copies of tables you can restore from.">
            <SnapshotsPanel
              connection={connection}
              tables={tables}
              onTablesChanged={() => setTablesReload((value) => value + 1)}
            />
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  )
}
