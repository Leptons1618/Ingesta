"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  Columns3,
  Database,
  Download,
  KeyRound,
  Pencil,
  Plus,
  Save,
  Table2,
  Trash2,
} from "lucide-react"

import {
  ConfirmDialog,
  DataGrid,
  EmptyState,
  LoadingCard,
  PageHeader,
  Section,
  StatCard,
  StatGrid,
  StatusAlert,
  Toolbar,
  ToolbarGroup,
  ToolbarSpacer,
  type DataGridSort,
} from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api } from "@/lib/api"
import { EXPORT_FORMATS, exportGrid, type ExportFormat } from "@/lib/export"
import { assessDropTable, assessOverwrite, assessRestoreSnapshot, assessTruncate } from "@/lib/guardrails"
import { pushGrid, type PushMode } from "@/lib/push"
import { useAppSettingsStore } from "@/lib/settings"
import { ConnectionStorage } from "@/lib/storage"
import { toast } from "@/lib/toast"
import type {
  DatabaseColumn,
  DatabaseConfig,
  DatabaseTable,
  Grid,
  GridColumn,
  GuardrailAssessment,
  TableSnapshot,
} from "@/lib/types"

import { ColumnEditor } from "@/components/tables/column-editor"
import { PendingPanel } from "@/components/tables/pending-panel"
import {
  addRow,
  assessPending,
  coerceCell,
  emptyPending,
  keepOnly,
  mergeAssessments,
  pendingCount,
  pendingPlan,
  pendingSteps,
  recordEdit,
  removeNewRow,
  removeRow,
  removePendingEntry,
  setNewRowValue,
  setTableRename,
  type PendingChanges,
} from "@/components/tables/pending-changes"
import { RenameTableDialog } from "@/components/tables/rename-table-dialog"
import { SaveAsDialog } from "@/components/tables/save-as-dialog"
import { SelectionBar } from "@/components/tables/selection-bar"
import { SnapshotsPanel } from "@/components/tables/snapshots-panel"

/** One window of the table, exactly as the database returned it. */
interface TablePage {
  columns: string[]
  rows: unknown[][]
  totalRows: number
}

/** Which row a displayed index is: one the database holds, or one that is pending. */
type RowIdentity = { kind: "db"; rowKey: unknown; source: number } | { kind: "new"; id: string }

interface ConfirmRequest {
  assessment: GuardrailAssessment
  label: string
  run: () => Promise<void>
}

const IDLE_ASSESSMENT: GuardrailAssessment = {
  risk: "safe",
  title: "Nothing to confirm",
  summary: "",
  warnings: [],
}

/**
 * Table studio: pull a live table into the browser, edit its shape and values,
 * and apply the plan back to the database in one deliberate step.
 */
export default function TableStudioPage() {
  const pageSize = useAppSettingsStore((state) => state.guardrails.maxRowsPerPage)
  const snapshotBeforeMutation = useAppSettingsStore((state) => state.guardrails.snapshotBeforeMutation)
  const requireTypedConfirmation = useAppSettingsStore((state) => state.guardrails.requireTypedConfirmation)

  const [connections, setConnections] = useState<DatabaseConfig[]>([])
  const [connection, setConnection] = useState<DatabaseConfig | null>(null)
  const [tables, setTables] = useState<DatabaseTable[]>([])
  const [tableName, setTableName] = useState<string | null>(null)
  const [structure, setStructure] = useState<DatabaseColumn[]>([])
  const [page, setPage] = useState<TablePage | null>(null)
  const [offset, setOffset] = useState(0)
  const [sort, setSort] = useState<DataGridSort | null>(null)
  const [snapshots, setSnapshots] = useState<TableSnapshot[]>([])
  const [pending, setPending] = useState<PendingChanges>(emptyPending)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null)
  const [columnEditorOpen, setColumnEditorOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [saveAsOpen, setSaveAsOpen] = useState(false)

  // Saved connections live in localStorage, so they can only be read on the client.
  useEffect(() => {
    setConnections(ConnectionStorage.getAll())
  }, [])

  const primaryKey = structure.find((column) => column.isPrimaryKey)?.name ?? null

  /* ------------------------------------------------------------------ data */

  const loadTables = useCallback(async (config: DatabaseConfig) => {
    setLoading(true)
    setError(null)
    const result = await api.getTables(config)
    setLoading(false)
    if (!result.ok) {
      setTables([])
      setError(result.error)
      return
    }
    setTables(result.data)
  }, [])

  const loadStructure = useCallback(
    async (config: DatabaseConfig, name: string) => {
      const result = await api.getTableStructure(config, name)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setStructure(result.data)
    },
    [],
  )

  const loadPage = useCallback(
    async (config: DatabaseConfig, name: string, nextOffset: number, nextSort: DataGridSort | null) => {
      setLoading(true)
      setError(null)
      const result = await api.previewTable(config, name, {
        limit: pageSize,
        offset: nextOffset,
        orderBy: nextSort?.column,
        direction: nextSort?.direction,
      })
      setLoading(false)
      if (!result.ok) {
        setPage(null)
        setError(result.error)
        return
      }

      // Deleting rows can leave the window past the end of the table; land on
      // the last page that still holds rows instead of showing an empty grid.
      const lastOffset = Math.max(0, Math.floor(Math.max(0, result.data.totalRows - 1) / pageSize) * pageSize)
      if (result.data.totalRows > 0 && nextOffset > lastOffset) {
        setOffset(lastOffset)
        await loadPage(config, name, lastOffset, nextSort)
        return
      }

      setPage({ columns: result.data.columns, rows: result.data.data, totalRows: result.data.totalRows })
    },
    [pageSize],
  )

  const loadSnapshots = useCallback(async (config: DatabaseConfig) => {
    const result = await api.listSnapshots(config)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSnapshots(result.data)
  }, [])

  const selectConnection = useCallback(
    async (config: DatabaseConfig | null) => {
      setConnection(config)
      setTableName(null)
      setTables([])
      setStructure([])
      setPage(null)
      setSnapshots([])
      setPending(emptyPending())
      setError(null)
      setNotice(null)
      setOffset(0)
      setSort(null)
      if (!config) return

      // Records the open, which is what the picker sorts by.
      ConnectionStorage.markUsed(config.id)
      setConnections(ConnectionStorage.getAll())
      await loadTables(config)
    },
    [loadTables],
  )

  const openTable = useCallback(
    (name: string) => {
      if (!connection) return
      setTableName(name)
      setOffset(0)
      setSort(null)
      setPending(emptyPending())
      setStructure([])
      setPage(null)
      void loadStructure(connection, name)
      void loadPage(connection, name, 0, null)
      void loadSnapshots(connection)
    },
    [connection, loadPage, loadSnapshots, loadStructure],
  )

  const refresh = useCallback(async () => {
    if (!connection || !tableName) return
    await Promise.all([
      loadStructure(connection, tableName),
      loadPage(connection, tableName, offset, sort),
      loadSnapshots(connection),
    ])
  }, [connection, loadPage, loadSnapshots, loadStructure, offset, sort, tableName])

  const goToPage = useCallback(
    (nextOffset: number) => {
      if (!connection || !tableName) return
      setOffset(nextOffset)
      void loadPage(connection, tableName, nextOffset, sort)
    },
    [connection, loadPage, sort, tableName],
  )

  const changeSort = useCallback(
    (next: DataGridSort | null) => {
      setSort(next)
      setOffset(0)
      if (connection && tableName) void loadPage(connection, tableName, 0, next)
    },
    [connection, loadPage, tableName],
  )

  /* ---------------------------------------------------------------- display */

  const gridColumns: GridColumn[] = useMemo(() => {
    const fetched = page?.columns ?? []
    const order = pending.order
    const ordered = order
      ? [...order.filter((name) => fetched.includes(name)), ...fetched.filter((name) => !order.includes(name))]
      : fetched

    return ordered.map((name) => {
      const column = structure.find((entry) => entry.name === name)
      return {
        name,
        type: column?.type ?? "TEXT",
        nullable: column?.nullable ?? true,
        isPrimaryKey: column?.isPrimaryKey,
        defaultValue: column?.defaultValue,
      }
    })
  }, [page, pending.order, structure])

  /**
   * What the grid renders: the fetched window with pending edits and new rows
   * layered on top, and deleted rows taken out. Identities travel beside the
   * rows so an edit can be traced back to the row the database holds.
   */
  const display = useMemo(() => {
    const edits = new Map<string, Map<string, unknown>>()
    for (const edit of pending.edits) {
      const forRow = edits.get(String(edit.rowKey)) ?? new Map<string, unknown>()
      forRow.set(edit.column, edit.value)
      edits.set(String(edit.rowKey), forRow)
    }
    const removed = new Set(pending.removals.map((removal) => String(removal.rowKey)))

    const rows: unknown[][] = []
    const identities: RowIdentity[] = []
    const sources = gridColumns.map((column) => page?.columns.indexOf(column.name) ?? -1)
    const keyIndex = primaryKey ? (page?.columns.indexOf(primaryKey) ?? -1) : -1

    page?.rows.forEach((row, source) => {
      const rowKey = keyIndex >= 0 ? row[keyIndex] : source
      if (removed.has(String(rowKey))) return
      const forRow = edits.get(String(rowKey))
      rows.push(gridColumns.map((column, index) => (forRow?.has(column.name) ? forRow.get(column.name) : row[sources[index]])))
      identities.push({ kind: "db", rowKey, source })
    })

    for (const insert of pending.inserts) {
      rows.push(gridColumns.map((column) => insert.values[column.name] ?? null))
      identities.push({ kind: "new", id: insert.id })
    }

    return { rows, identities }
  }, [gridColumns, page, pending, primaryKey])

  /* ------------------------------------------------------------ cell edits */

  const changeCell = useCallback(
    (rowIndex: number, columnIndex: number, value: unknown) => {
      const identity = display.identities[rowIndex]
      const column = gridColumns[columnIndex]
      if (!identity || !column) return

      const coerced = coerceCell(String(value ?? ""), column.type)

      if (identity.kind === "new") {
        setPending((current) => setNewRowValue(current, identity.id, column.name, coerced))
        return
      }

      const source = page?.columns.indexOf(column.name) ?? -1
      const previous = source >= 0 ? (page?.rows[identity.source]?.[source] ?? null) : null
      setPending((current) => recordEdit(current, { rowKey: identity.rowKey, column: column.name, value: coerced, previous }))
    },
    [display.identities, gridColumns, page],
  )

  const deleteRow = useCallback(
    (rowIndex: number) => {
      const identity = display.identities[rowIndex]
      if (!identity) return

      if (identity.kind === "new") {
        setPending((current) => removeNewRow(current, identity.id))
        return
      }

      const row = page?.rows[identity.source] ?? []
      const label = (page?.columns ?? [])
        .map((name, index) => `${name}=${row[index] === null || row[index] === undefined ? "NULL" : String(row[index])}`)
        .slice(0, 3)
        .join(", ")

      setPending((current) => removeRow(current, { rowKey: identity.rowKey, label }))
    },
    [display.identities, page],
  )

  /* -------------------------------------------------------------- confirm */

  /** Every destructive path goes through here, so the gate cannot be skipped. */
  const ask = useCallback(
    (assessment: GuardrailAssessment, label: string, run: () => Promise<void>) => {
      setConfirmRequest({
        assessment: requireTypedConfirmation ? assessment : { ...assessment, confirmation: undefined },
        label,
        run,
      })
    },
    [requireTypedConfirmation],
  )

  /** Snapshots the table when the setting asks for it, and says so afterwards. */
  const snapshotFirst = useCallback(
    async (config: DatabaseConfig, name: string): Promise<{ ok: true; note: string } | { ok: false; error: string }> => {
      if (!snapshotBeforeMutation) return { ok: true, note: "" }
      const snapshot = await api.createSnapshot(config, name)
      if (!snapshot.ok) return { ok: false, error: snapshot.error }
      return { ok: true, note: ` Snapshot "${snapshot.data.name}" holds the table as it was.` }
    },
    [snapshotBeforeMutation],
  )

  /* ---------------------------------------------------------------- apply */

  const applyPending = useCallback(() => {
    if (!connection || !tableName) return

    const count = pendingCount(pending)
    const plan = pendingPlan(pending, primaryKey)
    const assessment = mergeAssessments(assessPending(pending, tableName, page?.totalRows ?? 0), tableName, count)

    ask(assessment, "Apply changes", async () => {
      setBusy(true)
      setError(null)
      setNotice(null)

      let note = ""
      if (assessment.risk === "destructive") {
        const snapshot = await snapshotFirst(connection, tableName)
        if (!snapshot.ok) {
          setBusy(false)
          setError(`No snapshot could be taken, so nothing was applied: ${snapshot.error}`)
          return
        }
        note = snapshot.note
      }

      const steps = pendingSteps(plan, connection)
      let applied = 0
      let stoppedAt = steps.length
      let failure: string | null = null
      let activeName = tableName

      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index]
        const result = await step.run(activeName)
        if (!result.ok) {
          failure = `${step.label} failed: ${result.error}`
          stoppedAt = index
          break
        }
        applied += 1
        // Everything after the rename has to address the table's new name.
        if (step.id === "rename-table" && pending.renameTable) activeName = pending.renameTable
      }

      if (failure) {
        // Only the steps that ran are gone; the rest stay pending, visibly.
        const remaining = new Set(steps.slice(stoppedAt).map((step) => step.id))
        setPending((current) => keepOnly(current, remaining))
        setError(`${failure}. ${applied} change${applied === 1 ? "" : "s"} before it were applied; the rest are still pending.${note}`)
        toast.error("Apply stopped", failure)
      } else {
        setPending(emptyPending())
        setNotice(`${applied} change${applied === 1 ? "" : "s"} applied to "${activeName}".${note}`)
        toast.success("Applied to database", `${applied} change${applied === 1 ? "" : "s"} written to ${activeName}.`)
        if (activeName !== tableName) setTableName(activeName)
      }

      // The grid has to show what the database holds now, not what we sent.
      await Promise.all([
        loadStructure(connection, activeName),
        loadPage(connection, activeName, offset, sort),
        loadSnapshots(connection),
      ])
      setBusy(false)
    })
  }, [
    ask,
    connection,
    loadPage,
    loadSnapshots,
    loadStructure,
    offset,
    page,
    pending,
    primaryKey,
    snapshotFirst,
    sort,
    tableName,
  ])

  /* ------------------------------------------------------- table operations */

  const truncate = useCallback(() => {
    if (!connection || !tableName) return

    ask(assessTruncate(tableName, page?.totalRows ?? 0), "Delete all rows", async () => {
      setBusy(true)
      setError(null)
      setNotice(null)

      const snapshot = await snapshotFirst(connection, tableName)
      if (!snapshot.ok) {
        setBusy(false)
        setError(`No snapshot could be taken, so nothing was deleted: ${snapshot.error}`)
        return
      }

      const result = await api.truncateTable(connection, tableName)
      setBusy(false)
      if (!result.ok) {
        setError(result.error)
        return
      }

      // Every pending row change referred to rows that no longer exist.
      setPending(emptyPending())
      setNotice(`${result.data.deletedRows.toLocaleString()} rows deleted from "${tableName}".${snapshot.note}`)
      toast.success("Table emptied", `${result.data.deletedRows.toLocaleString()} rows deleted.`)
      await refresh()
    })
  }, [ask, connection, page, refresh, snapshotFirst, tableName])

  const drop = useCallback(() => {
    if (!connection || !tableName) return

    ask(assessDropTable(tableName, page?.totalRows ?? 0), "Drop table", async () => {
      setBusy(true)
      setError(null)
      setNotice(null)

      const snapshot = await snapshotFirst(connection, tableName)
      if (!snapshot.ok) {
        setBusy(false)
        setError(`No snapshot could be taken, so the table was left alone: ${snapshot.error}`)
        return
      }

      const result = await api.dropTable(connection, tableName)
      if (!result.ok) {
        setBusy(false)
        setError(result.error)
        return
      }

      setNotice(`Table "${tableName}" dropped.${snapshot.note}`)
      toast.success("Table dropped", `"${tableName}" is gone from the database.`)
      setTableName(null)
      setStructure([])
      setPage(null)
      setSnapshots([])
      setPending(emptyPending())
      await loadTables(connection)
      setBusy(false)
    })
  }, [ask, connection, loadTables, page, snapshotFirst, tableName])

  const restoreSnapshot = useCallback(
    (snapshot: TableSnapshot) => {
      if (!connection || !tableName) return

      ask(assessRestoreSnapshot(snapshot, page?.totalRows ?? 0), "Restore snapshot", async () => {
        setBusy(true)
        setError(null)
        setNotice(null)

        const before = await snapshotFirst(connection, tableName)
        if (!before.ok) {
          setBusy(false)
          setError(`No snapshot of the current rows could be taken, so nothing was restored: ${before.error}`)
          return
        }

        const result = await api.restoreSnapshot(connection, snapshot.name)
        if (!result.ok) {
          setBusy(false)
          setError(result.error)
          return
        }

        setPending(emptyPending())
        setNotice(
          `${result.data.restoredRows.toLocaleString()} rows restored from "${snapshot.name}".${before.note}`,
        )
        toast.success("Snapshot restored", `${result.data.restoredRows.toLocaleString()} rows back in "${tableName}".`)
        await refresh()
        setBusy(false)
      })
    },
    [ask, connection, page, refresh, snapshotFirst, tableName],
  )

  const saveAs = useCallback(
    (target: string, mode: PushMode) => {
      if (!connection || !tableName) return
      const grid: Grid = { columns: gridColumns, rows: display.rows }
      setSaveAsOpen(false)

      ask(
        assessOverwrite(target, grid.rows.length, mode),
        mode === "create" ? "Create table" : mode === "append" ? "Append rows" : "Replace contents",
        async () => {
          setBusy(true)
          setError(null)
          setNotice(null)

          let note = ""
          if (mode === "replace") {
            const snapshot = await snapshotFirst(connection, target)
            if (!snapshot.ok) {
              setBusy(false)
              setError(`No snapshot of "${target}" could be taken, so nothing was written: ${snapshot.error}`)
              return
            }
            note = snapshot.note
          }

          const result = await pushGrid({ config: connection, grid, tableName: target, mode })
          setBusy(false)
          if (!result.ok) {
            setError(result.error)
            toast.error("Save as failed", result.error)
            return
          }

          setNotice(
            `${result.data.rowsWritten.toLocaleString()} rows written to "${result.data.tableName}"${
              result.data.created ? " (new table)" : ""
            }.${note}`,
          )
          toast.success("Saved", `${result.data.rowsWritten.toLocaleString()} rows in "${result.data.tableName}".`)
          await loadTables(connection)
        },
      )
    },
    [ask, connection, display.rows, gridColumns, loadTables, snapshotFirst, tableName],
  )

  const exportPage = useCallback(
    (format: ExportFormat) => {
      if (!tableName) return
      const grid: Grid = { columns: gridColumns, rows: display.rows }
      exportGrid(grid, `${tableName}_page${Math.floor(offset / pageSize) + 1}`, format)
      toast.success("Export started", `${format.toUpperCase()} download for "${tableName}".`)
    },
    [display.rows, gridColumns, offset, pageSize, tableName],
  )

  /* ------------------------------------------------------------------ view */

  const totalRows = page?.totalRows ?? 0
  const pageNumber = Math.floor(offset / pageSize) + 1
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize))
  const shownRows = display.rows.length
  const rowEditing = primaryKey !== null
  const thisTableSnapshots = snapshots.filter((snapshot) => snapshot.table === tableName)

  return (
    <div className="text-foreground">
      <PageHeader
        title="Table studio"
        description="Pull a live table into the browser, edit its shape and values, then apply the plan back."
        badge={connection ? <Badge variant="outline">{connection.name}</Badge> : undefined}
      />

      <main className="w-full space-y-6 px-6 py-8">
        <SelectionBar
          connections={connections}
          connection={connection}
          onConnectionChange={(config) => void selectConnection(config)}
          tables={tables}
          tableName={tableName}
          onTableChange={openTable}
          loading={loading}
          onRefresh={() => void refresh()}
        />

        {error ? <StatusAlert tone="error">{error}</StatusAlert> : null}
        {notice ? <StatusAlert tone="success">{notice}</StatusAlert> : null}

        {connections.length === 0 ? (
          <EmptyState
            icon={<Database />}
            title="No saved connections"
            description="A table lives behind a connection. Save one and it shows up in the picker above."
            action={
              <Button asChild variant="outline">
                <Link href="/connections">Open connections</Link>
              </Button>
            }
          />
        ) : null}

        {connection && tables.length === 0 && !loading ? (
          <EmptyState
            icon={<Table2 />}
            title={`No tables in "${connection.database}"`}
            description="Import a workbook to create one, or point the picker at another connection."
            action={
              <Button asChild variant="outline">
                <Link href="/import">Import a workbook</Link>
              </Button>
            }
          />
        ) : null}

        {connection && tables.length > 0 && !tableName ? (
          <EmptyState
            icon={<Columns3 />}
            title="Pick a table"
            description="Choose a table above to pull its rows into the grid. Nothing is written until you apply a plan."
          />
        ) : null}

        {tableName ? (
          <>
            <StatGrid>
              <StatCard label="Rows in table" value={totalRows} icon={<Table2 className="h-4 w-4" />} />
              <StatCard label="On this page" value={shownRows} hint={`Page ${pageNumber} of ${pageCount}`} />
              <StatCard label="Columns" value={gridColumns.length} icon={<Columns3 className="h-4 w-4" />} />
              <StatCard
                label="Pending"
                value={pendingCount(pending)}
                tone={pendingCount(pending) > 0 ? "warning" : "default"}
                hint="Not written yet"
              />
            </StatGrid>

            {!rowEditing && structure.length > 0 ? (
              <StatusAlert tone="warning">
                <span className="flex items-start gap-2">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    “{tableName}” has no primary key, so the studio cannot address a single row. Cell editing, row
                    deletion and new rows are off for this table; column changes, exports and “save as” still work.
                    Matching rows on every column instead would silently change rows you did not mean to touch.
                  </span>
                </span>
              </StatusAlert>
            ) : null}

            <Section
              title={
                <span className="flex items-center gap-2">
                  {tableName}
                  <Badge variant="outline">{gridColumns.length} columns</Badge>
                </span>
              }
              description={`${totalRows.toLocaleString()} rows in the table. This page holds up to ${pageSize} of them.`}
            >
              <Toolbar className="mb-3 rounded-xl border">
                <ToolbarGroup>
                  <Button size="sm" onClick={() => setPending((current) => addRow(current))} disabled={!rowEditing}>
                    <Plus className="h-4 w-4" />
                    Add row
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={structure.length === 0}
                    onClick={() => setColumnEditorOpen(true)}
                  >
                    <Columns3 className="h-4 w-4" />
                    Edit columns
                  </Button>
                </ToolbarGroup>

                <ToolbarSpacer />

                <ToolbarGroup>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        <Download className="h-4 w-4" />
                        Export page
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {EXPORT_FORMATS.map((format) => (
                        <DropdownMenuItem key={format.value} onSelect={() => exportPage(format.value)}>
                          <span className="flex flex-col">
                            <span>{format.label}</span>
                            <span className="text-xs text-muted-foreground">{format.description}</span>
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button size="sm" variant="outline" onClick={() => setSaveAsOpen(true)} disabled={shownRows === 0}>
                    <Save className="h-4 w-4" />
                    Save as
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline">
                        <Pencil className="h-4 w-4" />
                        Table
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                        <Pencil className="h-4 w-4" />
                        Rename table…
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={truncate}>
                        <Trash2 className="h-4 w-4" />
                        Delete all rows
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={drop}>
                        <Trash2 className="h-4 w-4" />
                        Drop table
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </ToolbarGroup>
              </Toolbar>

              {loading && !page ? (
                <LoadingCard label={`Loading "${tableName}"`} hint="Reading the structure and the first page of rows." />
              ) : (
                <>
                  <DataGrid
                    columns={gridColumns}
                    rows={display.rows}
                    rowNumbers
                    height={460}
                    busy={loading}
                    editable={rowEditing}
                    onCellChange={rowEditing ? changeCell : undefined}
                    onRowDelete={rowEditing ? deleteRow : undefined}
                    sort={sort}
                    onSortChange={changeSort}
                    emptyMessage="This table has no rows. Add a row or import data into it."
                  />

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                    <span>
                      Showing {shownRows.toLocaleString()} of {totalRows.toLocaleString()} rows
                      {pending.inserts.length > 0 ? ` · ${pending.inserts.length} new row(s) at the bottom` : ""}
                    </span>
                    <span className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={offset === 0 || loading}
                        onClick={() => goToPage(Math.max(0, offset - pageSize))}
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <span className="tabular-nums">
                        Page {pageNumber} of {pageCount}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={offset + pageSize >= totalRows || loading}
                        onClick={() => goToPage(offset + pageSize)}
                      >
                        Next
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </span>
                  </div>
                </>
              )}
            </Section>

            <PendingPanel
              pending={pending}
              table={tableName}
              primaryKey={primaryKey}
              totalRows={totalRows}
              busy={busy}
              onDiscard={() => setPending(emptyPending())}
              onApply={applyPending}
              onRemoveEntry={(id) => setPending((current) => removePendingEntry(current, id, primaryKey))}
            />

            <SnapshotsPanel
              snapshots={thisTableSnapshots}
              loading={loading}
              busy={busy}
              onTake={(name) => {
                if (!connection || !tableName) return
                void api.createSnapshot(connection, tableName, name || undefined).then(async (result) => {
                  if (!result.ok) {
                    setError(result.error)
                    return
                  }
                  setNotice(`Snapshot "${result.data.name}" holds ${result.data.rowCount.toLocaleString()} rows.`)
                  toast.success("Snapshot taken", result.data.name)
                  await loadSnapshots(connection)
                })
              }}
              onRestore={restoreSnapshot}
              onRefresh={() => {
                if (connection) void loadSnapshots(connection)
              }}
            />
          </>
        ) : null}
      </main>

      {tableName ? (
        <>
          <ColumnEditor
            open={columnEditorOpen}
            onOpenChange={setColumnEditorOpen}
            structure={structure}
            pending={pending}
            onPendingChange={setPending}
          />

          <RenameTableDialog
            open={renameOpen}
            onOpenChange={setRenameOpen}
            table={tableName}
            onRename={(to) => setPending((current) => setTableRename(current, to))}
          />
        </>
      ) : null}

      <SaveAsDialog
        open={saveAsOpen}
        onOpenChange={setSaveAsOpen}
        tables={tables}
        rowCount={shownRows}
        busy={busy}
        onSave={saveAs}
      />

      <ConfirmDialog
        open={confirmRequest !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRequest(null)
        }}
        assessment={confirmRequest?.assessment ?? IDLE_ASSESSMENT}
        confirmLabel={confirmRequest?.label ?? "Confirm"}
        busy={busy}
        onConfirm={() => {
          const request = confirmRequest
          if (!request) return
          setConfirmRequest(null)
          void request.run()
        }}
      />
    </div>
  )
}
