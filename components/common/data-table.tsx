import type { ReactNode } from "react"

import { ScrollArea } from "@/components/ui/scroll-area"
import type { GridColumn } from "@/lib/types"
import { cn } from "@/lib/utils"

import { DataGrid } from "./data-grid"

/** Bordered, scrollable frame for any table, including hand-built ones. */
export function TableShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="table-shell">
      <ScrollArea className={cn("w-full", className)}>{children}</ScrollArea>
    </div>
  )
}

/** Previews only carry header labels, so every column is treated as free text. */
const TEXT_COLUMN: Omit<GridColumn, "name"> = { type: "TEXT", nullable: true }

/** Read-only grid of cells: previews, samples, and result rows all use this. */
export function DataTable({
  columns,
  rows,
  showRowNumbers = false,
  mono = false,
  className = "h-96",
}: {
  columns: string[]
  rows: unknown[][]
  showRowNumbers?: boolean
  mono?: boolean
  className?: string
}) {
  const gridColumns: GridColumn[] = columns.map((name) => ({ name, ...TEXT_COLUMN }))

  return (
    <DataGrid
      className={cn(className, mono && "font-mono")}
      fillHeight
      editable={false}
      columns={gridColumns}
      rows={rows}
      rowNumbers={showRowNumbers}
    />
  )
}
