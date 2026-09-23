"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Camera, ChevronLeft, ChevronRight, Ellipsis, Download, Pencil, RefreshCw, Trash2, XCircle } from "lucide-react"

import { DataGrid, EmptyState } from "@/components/common"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api } from "@/lib/api"
import { EXPORT_FORMATS, exportGrid } from "@/lib/export"
import { assessDropTable, assessRenameTable, assessTruncate } from "@/lib/guardrails"
import { useAppSettingsStore } from "@/lib/settings"
import { toast } from "@/lib/toast"
import type { DatabaseConfig, DatabaseTable, GridColumn } from "@/lib/types"

import { AssessmentNote, useGuardrailConfirm } from "./guardrail-gate"
import { NameDialog } from "./name-dialog"
import { takeSafetySnapshot } from "./safety"

interface TableBrowserProps {
  connection: DatabaseConfig
  table: DatabaseTable
  /** Bumped when a sibling view changed the data, so the open page re-reads too. */
  reloadToken: number
  /** The row counts in the tables list changed: re-read them. */
  onTablesChanged: () => void
  /** The table no longer exists under this name. */
  onTableGone: () => void
  /** The table answers to a new name now. */
  onTableRenamed: (to: string) => void
}

/** One fetched page: what the server sent, with the count it knows. */
interface FetchedPage {
  columns: string[]
  data: unknown[][]
  totalRows: number
}

/**
 * Paging, sorting and the per-table actions all read from the server, so the
 * grid never holds more than one page and the row count it shows is the
 * server's, not a guess made from the rows that happen to be loaded.
 */
export function TableBrowser({
  connection,
  table,
  reloadToken,
  onTablesChanged,
  onTableGone,
  onTableRenamed,
}: TableBrowserProps) {
  const pageSize = useAppSettingsStore((state) => state.guardrails.maxRowsPerPage)
  const snapshotBeforeMutation = useAppSettingsStore((state) => state.guardrails.snapshotBeforeMutation)
  const { ask, gate } = useGuardrailConfirm()

  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<{ column: string; direction: "asc" | "desc" } | null>(null)
  const [result, setResult] = useState<FetchedPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [renaming, setRenaming] = useState(false)

  // The fetch is keyed on the table, the page and the sort, never on the
  // connection object: the list refresh after a test hands over a new object
  // for the same profile, and none of the rows have changed.
  const config = useRef(connection)
  config.current = connection

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      const response = await api.previewTable(config.current, table.name, {
        limit: pageSize,
        offset: page * pageSize,
        orderBy: sort?.column,
        direction: sort?.direction,
      })
      if (cancelled) return

      if (!response.ok) {
        setResult(null)
        setError(response.error)
      } else {
        setResult(response.data)
      }
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [table.name, page, pageSize, sort, reload, reloadToken])

  /** The fetched names carry the types the server knows, so widths read right. */
  const gridColumns = useMemo<GridColumn[]>(
    () =>
      (result?.columns ?? []).map((name) => {
        const known = table.columns.find((column) => column.name === name)
        return {
          name,
          type: known?.type ?? "TEXT",
          nullable: known?.nullable ?? true,
          isPrimaryKey: known?.isPrimaryKey,
        }
      }),
    [result, table.columns],
  )

  const pageCount = Math.max(1, Math.ceil((result?.totalRows ?? 0) / pageSize))

  const handleSnapshot = useCallback(async () => {
    const response = await api.createSnapshot(config.current, table.name)
    if (!response.ok) {
      toast.error(`Could not snapshot "${table.name}"`, response.error)
      return
    }

    toast.success(`Snapshot ${response.data.name} taken`, `${response.data.rowCount.toLocaleString()} rows stored.`)
    onTablesChanged()
  }, [onTablesChanged, table.name])

  const handleTruncate = useCallback(() => {
    ask({
      assessment: assessTruncate(table.name, table.rowCount),
      confirmLabel: "Delete every row",
      run: async () => {
        const safety = await takeSafetySnapshot(config.current, table.name, snapshotBeforeMutation)
        if (!safety.ok) {
          toast.error("Nothing was deleted", safety.error)
          return
        }

        const response = await api.truncateTable(config.current, table.name)
        if (!response.ok) {
          toast.error(`Could not empty "${table.name}"`, response.error)
          return
        }

        toast.success(
          `"${table.name}" emptied`,
          `${response.data.deletedRows.toLocaleString()} rows deleted.${safety.note}`,
        )
        onTablesChanged()
        setReload((value) => value + 1)
      },
    })
  }, [ask, onTablesChanged, snapshotBeforeMutation, table.name, table.rowCount])

  const handleDrop = useCallback(() => {
    ask({
      assessment: assessDropTable(table.name, table.rowCount),
      confirmLabel: "Drop table",
      run: async () => {
        const safety = await takeSafetySnapshot(config.current, table.name, snapshotBeforeMutation)
        if (!safety.ok) {
          toast.error("Nothing was dropped", safety.error)
          return
        }

        const response = await api.dropTable(config.current, table.name)
        if (!response.ok) {
          toast.error(`Could not drop "${table.name}"`, response.error)
          return
        }

        toast.success(`"${table.name}" dropped`, `The table is gone from the database.${safety.note}`)
        onTablesChanged()
        onTableGone()
      },
    })
  }, [ask, onTableGone, onTablesChanged, snapshotBeforeMutation, table.name, table.rowCount])

  const handleRename = useCallback(
    async (to: string) => {
      const response = await api.renameTable(config.current, table.name, to)
      if (!response.ok) {
        toast.error(`Could not rename "${table.name}"`, response.error)
        return
      }

      setRenaming(false)
      toast.success(`Renamed to "${to}"`, response.data.message)
      onTablesChanged()
      onTableRenamed(to)
    },
    [onTableRenamed, onTablesChanged, table.name],
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-medium">{table.name}</p>
          <p className="text-xs text-muted-foreground">
            {table.columns.length} columns
            {table.rowCount === undefined ? "" : ` · ${table.rowCount.toLocaleString()} rows`}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Reload "${table.name}"`}
            disabled={loading}
            onClick={() => setReload((value) => value + 1)}
          >
            <RefreshCw className={loading ? "animate-spin" : undefined} />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <Ellipsis />
                Table actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onSelect={() => setRenaming(true)}>
                <Pencil />
                Rename table
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleSnapshot()}>
                <Camera />
                Take a snapshot
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Export this page</DropdownMenuLabel>
              {EXPORT_FORMATS.map((format) => (
                <DropdownMenuItem
                  key={format.value}
                  disabled={!result || result.data.length === 0}
                  onSelect={() =>
                    result
                      ? exportGrid(
                          { columns: gridColumns, rows: result.data },
                          `${table.name}-page-${page + 1}`,
                          format.value,
                        )
                      : undefined
                  }
                >
                  <Download />
                  {format.label}
                  <span className="ml-auto text-xs text-muted-foreground">.{format.extension}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={handleTruncate}>
                <XCircle />
                Delete every row
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={handleDrop}>
                <Trash2 />
                Drop table
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={<XCircle />}
          title="That page could not be read"
          description={error}
          action={
            <Button size="sm" variant="outline" onClick={() => setReload((value) => value + 1)}>
              Try again
            </Button>
          }
        />
      ) : (
        <>
          <DataGrid
            columns={gridColumns}
            rows={result?.data ?? []}
            editable={false}
            rowNumbers
            sort={sort}
            onSortChange={(next) => {
              setSort(next)
              setPage(0)
            }}
            height={520}
            busy={loading}
            emptyMessage={loading ? "Reading rows…" : "This table has no rows."}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {result === null
                ? loading
                  ? "Reading the first page…"
                  : "This page holds no rows."
                : `${result.totalRows.toLocaleString()} rows in the table · page ${page + 1} of ${pageCount} · ${pageSize} per page${
                    result.data.length > 0
                      ? ` · showing rows ${page * pageSize + 1}–${page * pageSize + result.data.length}`
                      : ""
                  }`}
            </span>

            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" disabled={page === 0 || loading} onClick={() => setPage(0)}>
                First
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0 || loading}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
              >
                <ChevronLeft />
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pageCount - 1 || loading}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
                <ChevronRight />
              </Button>
            </div>
          </div>
        </>
      )}

      <NameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title={`Rename "${table.name}"`}
        description="The table keeps its rows. Anything pointing at the old name breaks."
        label="New table name"
        initialValue={table.name}
        submitLabel="Rename table"
        onSubmit={handleRename}
        renderNote={(value) => <AssessmentNote assessment={assessRenameTable(table.name, value)} />}
      />

      {gate}
    </div>
  )
}
