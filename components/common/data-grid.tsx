"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, UIEvent } from "react"
import { ArrowDown, ArrowUp, ChevronsUpDown, Ellipsis, KeyRound, Loader2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAppSettingsStore, type TableDensity } from "@/lib/settings"
import type { GridColumn, SortDirection } from "@/lib/types"
import { cn, formatCellValue } from "@/lib/utils"

export interface DataGridSort {
  column: string
  direction: SortDirection
}

export interface DataGridProps {
  columns: GridColumn[]
  rows: unknown[][]
  /** Inline editing; called when an edit is committed (Enter or blur). */
  onCellChange?: (rowIndex: number, columnIndex: number, value: unknown) => void
  /** Called from the row action menu. Providing it enables the menu. */
  onRowDelete?: (rowIndex: number) => void
  /** Extra menu items appended to the trailing actions cell. */
  renderRowActions?: (rowIndex: number) => ReactNode
  /** Sort is a SIGNAL ONLY — the grid never reorders rows itself. */
  sort?: DataGridSort | null
  onSortChange?: (sort: DataGridSort | null) => void
  /** Indices into `rows`. */
  selectedRows?: Set<number>
  onSelectedRowsChange?: (rows: Set<number>) => void
  /** Key is `"${rowIndex}:${columnIndex}"`. Highlights flagged cells. */
  flaggedCells?: Map<string, "error" | "warning">
  rowNumbers?: boolean
  /** Pixel height of the scroll viewport. Default 480. */
  height?: number
  emptyMessage?: string
  busy?: boolean
  /** Default true. When false, cells render read-only. */
  editable?: boolean
  className?: string
  /** Fill the parent's height instead of using `height`; the parent must be sized. */
  fillHeight?: boolean
}

/** Row height per density preset; the virtualiser depends on these staying fixed. */
const ROW_HEIGHT: Record<TableDensity, number> = {
  compact: 32,
  comfortable: 40,
  relaxed: 52,
}

const OVERSCAN = 8
const ROW_NUMBER_WIDTH = 56
const SELECTION_WIDTH = 40
const ACTIONS_WIDTH = 48
const MIN_COLUMN_WIDTH = 72
const DEFAULT_COLUMN_WIDTH = 200

const EMPTY_SELECTION: Set<number> = new Set()

interface CellPosition {
  row: number
  column: number
}

/** Width guess from the semantic type, so a fresh dataset opens readable. */
function defaultColumnWidth(column: GridColumn | undefined): number {
  if (!column) return DEFAULT_COLUMN_WIDTH
  const type = column.type.toUpperCase()
  if (type.includes("DATE") || type.includes("TIME")) return 150
  if (type.includes("BOOL")) return 110
  if (
    type.includes("INT") ||
    type.includes("DECIMAL") ||
    type.includes("NUMERIC") ||
    type.includes("FLOAT") ||
    type.includes("DOUBLE") ||
    type.includes("REAL")
  ) {
    return 130
  }
  if (type.includes("TEXT") || type.includes("JSON") || type.includes("CLOB")) return 260
  return DEFAULT_COLUMN_WIDTH
}

/**
 * Renders only the rows inside the viewport, which is what keeps a 50,000 row
 * dataset scrollable. Rows are positional: `rows[i]` belongs to `columns[i]`.
 */
export function DataGrid({
  columns,
  rows,
  onCellChange,
  onRowDelete,
  renderRowActions,
  sort = null,
  onSortChange,
  selectedRows,
  onSelectedRowsChange,
  flaggedCells,
  rowNumbers = false,
  height = 480,
  emptyMessage = "No rows to display.",
  busy = false,
  editable = true,
  className,
  fillHeight = false,
}: DataGridProps) {
  const density = useAppSettingsStore((state) => state.tableDensity)
  const stickyHeaders = useAppSettingsStore((state) => state.stickyHeaders)

  // Persisted settings only exist on the client; the server renders the
  // defaults, so the first client render must match them.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const rowHeight = mounted ? ROW_HEIGHT[density] ?? ROW_HEIGHT.comfortable : ROW_HEIGHT.comfortable
  const sticky = mounted ? stickyHeaders : true

  const selectionEnabled = Boolean(selectedRows && onSelectedRowsChange)
  const actionsEnabled = Boolean(onRowDelete || renderRowActions)
  const selected = selectedRows ?? EMPTY_SELECTION
  const columnCount = columns.length + (rowNumbers ? 1 : 0) + (selectionEnabled ? 1 : 0) + (actionsEnabled ? 1 : 0)

  /* ---------------------------------------------------------------- widths */

  const columnSignature = columns.map((column) => `${column.name}:${column.type}`).join("|")
  const [widths, setWidths] = useState<number[]>(() => columns.map(defaultColumnWidth))
  const lastSignature = useRef(columnSignature)
  // A different dataset must not inherit the previous column widths.
  if (lastSignature.current !== columnSignature) {
    lastSignature.current = columnSignature
    setWidths(columns.map(defaultColumnWidth))
  }

  const totalWidth = useMemo(
    () =>
      widths.reduce((sum, width) => sum + width, 0) +
      (rowNumbers ? ROW_NUMBER_WIDTH : 0) +
      (selectionEnabled ? SELECTION_WIDTH : 0) +
      (actionsEnabled ? ACTIONS_WIDTH : 0),
    [actionsEnabled, rowNumbers, selectionEnabled, widths]
  )

  const detachResize = useRef<(() => void) | null>(null)
  useEffect(() => () => detachResize.current?.(), [])

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>, index: number) => {
      event.preventDefault()
      event.stopPropagation()
      const startX = event.clientX
      const startWidth = widths[index] ?? defaultColumnWidth(columns[index])

      const onMove = (moveEvent: PointerEvent) => {
        const next = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + (moveEvent.clientX - startX)))
        setWidths((current) => current.map((value, position) => (position === index ? next : value)))
      }
      const onUp = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        detachResize.current = null
      }

      detachResize.current = onUp
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
    },
    [columns, widths]
  )

  const resetWidth = useCallback(
    (index: number) => {
      setWidths((current) => current.map((value, position) => (position === index ? defaultColumnWidth(columns[position]) : value)))
    },
    [columns]
  )

  /* ----------------------------------------------------------- virtualising */

  const scrollRef = useRef<HTMLDivElement>(null)
  const frame = useRef<number | null>(null)
  const [scrollTop, setScrollTop] = useState(0)

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    []
  )

  const handleScroll = useCallback((_event: UIEvent<HTMLDivElement>) => {
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      setScrollTop(scrollRef.current?.scrollTop ?? 0)
    })
  }, [])

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN)
  const end = Math.min(rows.length, Math.ceil((scrollTop + height) / rowHeight) + OVERSCAN)
  const topPad = start * rowHeight
  const bottomPad = Math.max(0, (rows.length - end) * rowHeight)

  /* --------------------------------------------------------------- editing */

  const [editing, setEditing] = useState<CellPosition | null>(null)
  const [draft, setDraft] = useState("")
  const committed = useRef(false)
  const cancelled = useRef(false)

  // React unmounts the editor before the browser can report a blur, and this
  // runs after that DOM update, so a later real blur is never swallowed.
  useEffect(() => {
    committed.current = false
    cancelled.current = false
  }, [editing])

  const beginEdit = useCallback(
    (row: number, column: number, value: unknown) => {
      if (!editable || !onCellChange) return
      committed.current = false
      cancelled.current = false
      setDraft(value === null || value === undefined ? "" : String(value))
      setEditing({ row, column })
    },
    [editable, onCellChange]
  )

  const commitEdit = useCallback(
    (next: CellPosition | null) => {
      if (!editing) return
      committed.current = true
      onCellChange?.(editing.row, editing.column, draft)
      if (next) {
        const value = rows[next.row]?.[next.column]
        setDraft(value === null || value === undefined ? "" : String(value))
      }
      setEditing(next)
    },
    [draft, editing, onCellChange, rows]
  )

  const cancelEdit = useCallback(() => {
    cancelled.current = true
    setEditing(null)
  }, [])

  const nextCell = useCallback(
    (current: CellPosition): CellPosition | null => {
      if (current.column + 1 < columns.length) return { row: current.row, column: current.column + 1 }
      if (current.row + 1 < rows.length) return { row: current.row + 1, column: 0 }
      return null
    },
    [columns.length, rows.length]
  )

  const handleEditorKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault()
        commitEdit(null)
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        cancelEdit()
        return
      }
      if (event.key === "Tab") {
        event.preventDefault()
        commitEdit(editing ? nextCell(editing) : null)
      }
    },
    [cancelEdit, commitEdit, editing, nextCell]
  )

  const handleEditorBlur = useCallback(() => {
    if (committed.current || cancelled.current) return
    commitEdit(null)
  }, [commitEdit])

  /* ------------------------------------------------------------- selection */

  const toggleRow = useCallback(
    (rowIndex: number) => {
      if (!onSelectedRowsChange) return
      const next = new Set(selected)
      if (next.has(rowIndex)) next.delete(rowIndex)
      else next.add(rowIndex)
      onSelectedRowsChange(next)
    },
    [onSelectedRowsChange, selected]
  )

  const toggleAll = useCallback(
    (checked: boolean) => {
      if (!onSelectedRowsChange) return
      onSelectedRowsChange(checked ? new Set(rows.map((_row, index) => index)) : new Set())
    },
    [onSelectedRowsChange, rows]
  )

  /* ------------------------------------------------------------------ sort */

  const toggleSort = useCallback(
    (column: GridColumn) => {
      if (!onSortChange) return
      const direction = sort && sort.column === column.name ? sort.direction : null
      if (direction === "asc") onSortChange({ column: column.name, direction: "desc" })
      else if (direction === "desc") onSortChange(null)
      else onSortChange({ column: column.name, direction: "asc" })
    },
    [onSortChange, sort]
  )

  /* ---------------------------------------------------------------- render */

  const viewportStyle: CSSProperties = fillHeight ? {} : { height }
  // Keeps the trailing icon button inside the row instead of setting its height.
  const actionSize = Math.max(20, rowHeight - 8)
  const headClass = cn(
    "bg-card text-left align-middle font-medium whitespace-nowrap",
    sticky && "sticky top-0 z-20"
  )
  const visible = rows.slice(start, end)
  const allSelected = rows.length > 0 && selected.size >= rows.length
  const someSelected = selected.size > 0 && !allSelected

  return (
    <div
      data-slot="data-grid"
      aria-busy={busy || undefined}
      className={cn("table-shell flex flex-col", className)}
    >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={viewportStyle}
        className={cn("relative w-full overflow-auto", fillHeight && "min-h-0 flex-1")}
      >
        <table
          className="w-full border-separate border-spacing-0 text-sm"
          style={{ width: totalWidth, tableLayout: "fixed" }}
        >
          <colgroup>
            {selectionEnabled ? <col style={{ width: SELECTION_WIDTH }} /> : null}
            {rowNumbers ? <col style={{ width: ROW_NUMBER_WIDTH }} /> : null}
            {columns.map((column, index) => (
              <col key={`${column.name}-${index}`} style={{ width: widths[index] ?? DEFAULT_COLUMN_WIDTH }} />
            ))}
            {actionsEnabled ? <col style={{ width: ACTIONS_WIDTH }} /> : null}
          </colgroup>

          <thead data-slot="table-header" className="[&_tr]:border-b">
            <tr data-slot="table-row">
              {selectionEnabled ? (
                <th data-slot="table-head" className={cn(headClass, "h-10 border-b border-border px-2")}>
                  <Checkbox
                    aria-label="Select all rows"
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                  />
                </th>
              ) : null}

              {rowNumbers ? (
                <th data-slot="table-head" className={cn(headClass, "h-10 border-b border-border px-2 text-right text-xs text-muted-foreground")}>
                  #
                </th>
              ) : null}

              {columns.map((column, index) => {
                const direction = sort && sort.column === column.name ? sort.direction : null

                return (
                  <th
                    key={`${column.name}-${index}`}
                    data-slot="table-head"
                    data-sorted={direction ?? undefined}
                    aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}
                    title={column.type}
                    className={cn(headClass, "group/head relative h-10 border-b border-border px-2")}
                  >
                    {onSortChange ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="flex h-full w-full min-w-0 cursor-pointer items-center gap-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        <span className="truncate">{column.name}</span>
                        {column.isPrimaryKey ? <KeyRound aria-label="Primary key" className="size-3 shrink-0 text-muted-foreground" /> : null}
                        <SortIcon direction={direction} />
                      </button>
                    ) : (
                      <span className="flex items-center gap-1">
                        <span className="truncate">{column.name}</span>
                        {column.isPrimaryKey ? <KeyRound aria-label="Primary key" className="size-3 shrink-0 text-muted-foreground" /> : null}
                      </span>
                    )}
                    <span
                      aria-hidden
                      title="Drag to resize · double-click to reset"
                      onPointerDown={(event) => startResize(event, index)}
                      onDoubleClick={() => resetWidth(index)}
                      className="absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none bg-transparent transition-colors hover:bg-primary/50 active:bg-primary"
                    />
                  </th>
                )
              })}

              {actionsEnabled ? (
                <th data-slot="table-head" aria-label="Row actions" className={cn(headClass, "h-10 border-b border-border px-2")} />
              ) : null}
            </tr>
          </thead>

          <tbody data-slot="table-body">
            {/* Always rendered so zebra parity stays stable while scrolling. */}
            <tr aria-hidden className="border-0">
              <td colSpan={Math.max(1, columnCount)} className="border-0 p-0" style={{ height: topPad }} />
            </tr>

            {visible.map((row, offset) => {
              const rowIndex = start + offset
              const isSelected = selectionEnabled && selected.has(rowIndex)

              return (
                <tr
                  key={rowIndex}
                  data-slot="table-row"
                  data-state={isSelected ? "selected" : undefined}
                  className={cn(
                    "transition-colors [&:hover>td]:bg-muted/50",
                    isSelected && "[&>td]:bg-primary/5"
                  )}
                >
                  {selectionEnabled ? (
                    <td
                      data-slot="table-cell"
                      className="relative border-b border-border px-2 py-1 align-middle"
                      style={{ height: rowHeight }}
                    >
                      {/* Block-level wrapper: an inline control would add a baseline
                          strut and push the row past its fixed height. */}
                      <span className="flex h-full items-center">
                        <Checkbox
                          aria-label={`Select row ${rowIndex + 1}`}
                          checked={isSelected}
                          onCheckedChange={() => toggleRow(rowIndex)}
                        />
                      </span>
                    </td>
                  ) : null}

                  {rowNumbers ? (
                    <td
                      data-slot="table-cell"
                      className="relative border-b border-border px-2 py-1 text-right align-middle font-mono text-xs leading-none text-muted-foreground tabular-nums"
                      style={{ height: rowHeight }}
                    >
                      {rowIndex + 1}
                    </td>
                  ) : null}

                  {columns.map((column, columnIndex) => {
                    const value = row[columnIndex]
                    const flag = flaggedCells?.get(`${rowIndex}:${columnIndex}`)
                    const isEditing = editing?.row === rowIndex && editing.column === columnIndex
                    const numeric = typeof value === "number" || typeof value === "bigint"

                    return (
                      <td
                        key={`${column.name}-${columnIndex}`}
                        data-slot="table-cell"
                        title={flag === "error" ? "Flagged by validation: error" : flag === "warning" ? "Flagged by validation: warning" : undefined}
                        onDoubleClick={() => beginEdit(rowIndex, columnIndex, value)}
                        style={{ height: rowHeight }}
                        className={cn(
                          "relative border-b border-border px-2 py-1 leading-none align-middle whitespace-nowrap",
                          numeric && "text-right tabular-nums",
                          flag === "error" && "border-l-2 border-l-destructive bg-destructive/10",
                          flag === "warning" && "border-l-2 border-l-amber-500 bg-amber-500/10",
                          editable && onCellChange && "cursor-cell"
                        )}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            value={draft}
                            spellCheck={false}
                            autoComplete="off"
                            aria-label={`Edit ${column.name} row ${rowIndex + 1}`}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={handleEditorKeyDown}
                            onBlur={handleEditorBlur}
                            onFocus={(event) => event.currentTarget.select()}
                            className={cn(
                              "absolute inset-0 w-full min-w-0 rounded-none bg-background px-2 text-sm outline-none ring-2 ring-primary ring-inset",
                              numeric && "text-right"
                            )}
                          />
                        ) : (
                          <span
                            className={cn(
                              "block truncate",
                              (value === null || value === undefined) && "text-muted-foreground"
                            )}
                          >
                            {formatCellValue(value)}
                          </span>
                        )}
                      </td>
                    )
                  })}

                  {actionsEnabled ? (
                    // No data-slot here: the density rules size data cells, and a
                    // fixed-height icon button is what actually bounds the row.
                    <td className="relative border-b border-border p-0 align-middle" style={{ height: rowHeight }}>
                      <span className="flex h-full items-center justify-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Row ${rowIndex + 1} actions`}
                              style={{ height: actionSize, width: actionSize }}
                              className="text-muted-foreground"
                            >
                              <Ellipsis className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            {renderRowActions?.(rowIndex)}
                            {renderRowActions && onRowDelete ? <DropdownMenuSeparator /> : null}
                            {onRowDelete ? (
                              <DropdownMenuItem variant="destructive" onSelect={() => onRowDelete(rowIndex)}>
                                <Trash2 className="size-4" />
                                Delete row
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </span>
                    </td>
                  ) : null}
                </tr>
              )
            })}

            <tr aria-hidden className="border-0">
              <td colSpan={Math.max(1, columnCount)} className="border-0 p-0" style={{ height: bottomPad }} />
            </tr>
          </tbody>
        </table>

        {rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : null}
      </div>

      {busy ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-background/60">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}
    </div>
  )
}

function SortIcon({ direction }: { direction: SortDirection | null }) {
  if (direction === "asc") return <ArrowUp aria-hidden className="size-3.5 shrink-0 text-primary" />
  if (direction === "desc") return <ArrowDown aria-hidden className="size-3.5 shrink-0 text-primary" />
  return <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 opacity-40" />
}
