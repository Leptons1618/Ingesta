"use client"

import { useEffect, useMemo, useRef } from "react"
import { ArrowUpDown, Columns3, Search, X } from "lucide-react"

import { DataGrid, Section, type DataGridSort } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toNumber, toText } from "@/lib/expression"
import { columnIndex } from "@/lib/operations"
import type { Grid } from "@/lib/types"

/** How the panel is asked to bring a row into view; `token` re-arms a repeat jump. */
export interface GridFocus {
  row: number
  token: number
}

/**
 * Blanks sort last in both directions and numbers sort numerically — the same
 * order the `sort` operation produces, so a view sort and a sorted dataset read
 * the same way.
 */
function compareCells(left: unknown, right: unknown): number {
  const leftBlank = left === null || left === undefined || left === ""
  const rightBlank = right === null || right === undefined || right === ""
  if (leftBlank && rightBlank) return 0
  if (leftBlank) return 1
  if (rightBlank) return -1

  const leftNumber = toNumber(left)
  const rightNumber = toNumber(right)
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber
  return toText(left).localeCompare(toText(right), undefined, { numeric: true })
}

/**
 * The grid tab.
 *
 * Search, sort and column visibility are view state — the dataset itself only
 * changes through operations. The DataGrid renders whatever rows it is handed,
 * so the panel keeps two translations (displayed row to grid row, displayed
 * column to grid column) and routes every row, flag and edit through them.
 */
export function GridPanel({
  grid,
  baseRowCount,
  search,
  onSearchChange,
  sort,
  onSortChange,
  hiddenColumns,
  onHiddenColumnsChange,
  flaggedCells,
  editable,
  editHint,
  onCellChange,
  focus,
  busy,
}: {
  grid: Grid
  /** Rows before the operations ran, so the panel can report what they removed. */
  baseRowCount: number
  search: string
  onSearchChange: (value: string) => void
  sort: DataGridSort | null
  onSortChange: (sort: DataGridSort | null) => void
  hiddenColumns: Set<string>
  onHiddenColumnsChange: (columns: Set<string>) => void
  flaggedCells?: Map<string, "error" | "warning">
  /** Inline editing is only offered while the visible grid is the base grid. */
  editable: boolean
  editHint?: string
  onCellChange: (rowIndex: number, columnIndex: number, value: unknown) => void
  focus: GridFocus | null
  busy?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  const visible = useMemo(
    () => grid.columns.map((column, index) => ({ column, index })).filter(({ column }) => !hiddenColumns.has(column.name)),
    [grid.columns, hiddenColumns],
  )
  const columnMap = useMemo(() => visible.map((entry) => entry.index), [visible])
  const columns = useMemo(() => visible.map((entry) => entry.column), [visible])

  const matched = useMemo(() => {
    const query = search.trim().toLowerCase()
    const indices = grid.rows.map((_row, index) => index)
    if (!query) return indices
    return indices.filter((index) => grid.rows[index].some((cell) => toText(cell).toLowerCase().includes(query)))
  }, [grid.rows, search])

  const ordered = useMemo(() => {
    if (!sort) return matched
    const source = columnIndex(grid, sort.column)
    if (source === -1) return matched
    const direction = sort.direction === "desc" ? -1 : 1
    return matched.slice().sort((left, right) => compareCells(grid.rows[left][source], grid.rows[right][source]) * direction)
  }, [grid, matched, sort])

  const rows = useMemo(
    () => ordered.map((index) => columnMap.map((column) => grid.rows[index][column])),
    [columnMap, grid.rows, ordered],
  )

  const flags = useMemo(() => {
    const translated = new Map<string, "error" | "warning">()
    if (!flaggedCells || flaggedCells.size === 0) return translated
    const rowPositions = new Map(ordered.map((index, position) => [index, position]))
    const columnPositions = new Map(columnMap.map((index, position) => [index, position]))
    for (const [key, severity] of flaggedCells) {
      const [row, column] = key.split(":").map(Number)
      const rowPosition = rowPositions.get(row)
      const columnPosition = columnPositions.get(column)
      if (rowPosition === undefined || columnPosition === undefined) continue
      translated.set(`${rowPosition}:${columnPosition}`, severity)
    }
    return translated
  }, [columnMap, flaggedCells, ordered])

  // Jumping to a finding is a proportion of the scroll height rather than a row
  // height: the virtualiser's row height comes from the density setting, and
  // the scroll height already accounts for it exactly.
  const token = focus?.token ?? 0
  useEffect(() => {
    if (!focus) return
    const scroller = containerRef.current?.querySelector<HTMLElement>('[data-slot="data-grid"] > div')
    if (!scroller) return
    const total = rows.length || 1
    const target = (focus.row / total) * scroller.scrollHeight - scroller.clientHeight / 2
    scroller.scrollTop = Math.max(0, Math.min(target, scroller.scrollHeight - scroller.clientHeight))
    // Keyed on the token alone: the scroll must not re-run when the rows change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const removedRows = Math.max(0, baseRowCount - grid.rows.length)
  const filtering = search.trim().length > 0

  const toggleColumn = (name: string, shown: boolean) => {
    const next = new Set(hiddenColumns)
    if (shown) next.delete(name)
    else if (columns.length > 1) next.add(name)
    onHiddenColumnsChange(next)
  }

  const summary = [
    `${grid.rows.length.toLocaleString()} row${grid.rows.length === 1 ? "" : "s"}`,
    `${grid.columns.length} column${grid.columns.length === 1 ? "" : "s"}`,
    removedRows > 0 ? `${removedRows.toLocaleString()} rows removed by operations` : "no rows removed by operations",
  ].join(" · ")

  return (
    <Section
      title="Grid"
      description={summary}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              aria-label="Search every column"
              placeholder="Search every column"
              className="w-52 pl-8"
              onChange={(event) => onSearchChange(event.target.value)}
            />
            {filtering ? (
              <button
                type="button"
                aria-label="Clear the search"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted"
                onClick={() => onSearchChange("")}
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          {sort ? (
            <Button variant="outline" size="sm" onClick={() => onSortChange(null)}>
              <ArrowUpDown className="size-3.5" />
              <span className="max-w-32 truncate">{sort.column}</span>
              {sort.direction === "asc" ? "asc" : "desc"}
            </Button>
          ) : null}

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 className="size-3.5" />
                Columns
                <Badge variant="secondary">
                  {columns.length}/{grid.columns.length}
                </Badge>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Visible columns</p>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={hiddenColumns.size === 0}
                  onClick={() => onHiddenColumnsChange(new Set())}
                >
                  Show all
                </Button>
              </div>
              <div className="max-h-72 space-y-0.5 overflow-y-auto">
                {grid.columns.map((column, position) => {
                  const shown = !hiddenColumns.has(column.name)
                  // Keyed by position as well as name: a sheet can carry two
                  // columns with the same header, and the label wiring has to
                  // stay unique even then.
                  const id = `column-${position}-${column.name}`
                  return (
                    <div key={id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
                      <Checkbox
                        id={id}
                        checked={shown}
                        // The last visible column stays: a grid with no columns
                        // has nothing to show and nothing to edit.
                        disabled={shown && columns.length === 1}
                        onCheckedChange={(checked) => toggleColumn(column.name, checked === true)}
                      />
                      <Label htmlFor={id} className="min-w-0 flex-1 truncate font-normal">
                        {column.name}
                      </Label>
                      <span className="shrink-0 text-xs text-muted-foreground">{column.type}</span>
                    </div>
                  )
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      }
    >
      <div className="space-y-3">
        {filtering ? (
          <p className="text-xs text-muted-foreground">
            {rows.length.toLocaleString()} of {grid.rows.length.toLocaleString()} rows match “{search.trim()}”.
          </p>
        ) : null}

        <div ref={containerRef}>
          <DataGrid
            columns={columns}
            rows={rows}
            height={560}
            rowNumbers
            busy={busy}
            editable={editable}
            sort={sort}
            onSortChange={onSortChange}
            flaggedCells={flags}
            onCellChange={editable ? (rowIndex, column, value) => onCellChange(ordered[rowIndex], columnMap[column], value) : undefined}
            emptyMessage={filtering ? "No rows match this search." : "This dataset has no rows."}
          />
        </div>

        {editHint ? <p className="text-xs text-muted-foreground">{editHint}</p> : null}
      </div>
    </Section>
  )
}
