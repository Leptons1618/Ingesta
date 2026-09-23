import type { ReactNode } from "react"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

/** Bordered, scrollable frame for any table, including hand-built ones. */
export function TableShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="table-shell">
      <ScrollArea className={cn("w-full", className)}>{children}</ScrollArea>
    </div>
  )
}

/** Dates read as verbose local strings by default; show the value that will be stored. */
function cellLabel(cell: unknown): string {
  if (cell === null || cell === undefined) return ""
  if (cell instanceof Date) {
    const day = cell.toISOString().slice(0, 10)
    const time = cell.toISOString().slice(11, 19)
    return time === "00:00:00" ? day : `${day} ${time}`
  }
  return String(cell)
}

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
  return (
    <TableShell className={className}>
      <Table>
        <TableHeader>
          <TableRow>
            {showRowNumbers ? <TableHead className="w-12">#</TableHead> : null}
            {columns.map((column, index) => (
              <TableHead key={`${column}-${index}`} className={cn("whitespace-nowrap font-semibold", mono && "font-mono")}>
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {showRowNumbers ? (
                <TableCell className="font-mono text-xs text-muted-foreground">{rowIndex + 1}</TableCell>
              ) : null}
              {row.map((cell, cellIndex) => (
                <TableCell key={cellIndex} className="max-w-56 align-top">
                  <span className="line-clamp-2 break-words text-sm">{cellLabel(cell)}</span>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableShell>
  )
}
