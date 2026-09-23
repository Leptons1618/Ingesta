"use client"

import { type ChangeEvent, useMemo, useState } from "react"
import { Database, FileSpreadsheet, Rows3, Search, TableProperties } from "lucide-react"

import { StatCard, StatGrid, StatusAlert, TableShell } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { DatabaseConfig, ExcelFile, SheetInput } from "@/lib/types"

type FilterMode = "all" | "selected" | "risky" | "large"
type SortMode = "rows-desc" | "rows-asc" | "name"

interface SheetRecord extends SheetInput {
  sheetKey: string
  rowCount: number
  signalLabels: string[]
}

interface SheetSelectionInterfaceProps {
  files: ExcelFile[]
  databaseConfig: DatabaseConfig
  onProceed: (sheets: SheetInput[]) => void
}

/** Shapes worth flagging before a sheet becomes a table. */
function riskSignals(headers: string[], rowCount: number) {
  const duplicateHeaders = new Set(headers.filter((header, index) => header && headers.indexOf(header) !== index))
  const signalLabels: string[] = []

  if (rowCount <= 5) signalLabels.push("Tiny sheet")
  if (rowCount >= 1000) signalLabels.push("Large batch")
  if (headers.some((header) => !header)) signalLabels.push("Blank headers")
  if (duplicateHeaders.size > 0) signalLabels.push("Duplicate headers")
  if (headers.length >= 20) signalLabels.push("Wide table")

  return signalLabels
}

export function SheetSelectionInterface({ files, databaseConfig, onProceed }: SheetSelectionInterfaceProps) {
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState("")
  const [filterMode, setFilterMode] = useState<FilterMode>("all")
  const [sortMode, setSortMode] = useState<SortMode>("rows-desc")

  const allSheets = useMemo<SheetRecord[]>(
    () =>
      files.flatMap((file) =>
        file.sheets.map((sheet) => ({
          ...sheet,
          fileName: file.name,
          sheetKey: `${file.name}::${sheet.name}`,
          rowCount: sheet.data.length,
          signalLabels: riskSignals(sheet.headers, sheet.data.length),
        })),
      ),
    [files],
  )

  const visibleSheets = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    const filtered = allSheets.filter((sheet) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        sheet.name.toLowerCase().includes(normalizedSearch) ||
        sheet.fileName.toLowerCase().includes(normalizedSearch)

      const matchesFilter =
        filterMode === "all" ||
        (filterMode === "selected" && selectedSheets.has(sheet.sheetKey)) ||
        (filterMode === "risky" && sheet.signalLabels.length > 0) ||
        (filterMode === "large" && sheet.rowCount >= 1000)

      return matchesSearch && matchesFilter
    })

    return filtered.sort((left, right) => {
      if (sortMode === "rows-asc") return left.rowCount - right.rowCount
      if (sortMode === "name") return `${left.fileName}-${left.name}`.localeCompare(`${right.fileName}-${right.name}`)
      return right.rowCount - left.rowCount
    })
  }, [allSheets, filterMode, searchTerm, selectedSheets, sortMode])

  const selectedRows = useMemo(
    () =>
      Array.from(selectedSheets).reduce((sum, sheetKey) => {
        const sheet = allSheets.find((entry) => entry.sheetKey === sheetKey)
        return sum + (sheet?.rowCount ?? 0)
      }, 0),
    [allSheets, selectedSheets],
  )

  const riskySheetCount = allSheets.filter((sheet) => sheet.signalLabels.length > 0).length
  const selectedCount = selectedSheets.size

  const toggleSheetSelection = (sheetKey: string) => {
    setSelectedSheets((previous) => {
      const next = new Set(previous)
      if (next.has(sheetKey)) next.delete(sheetKey)
      else next.add(sheetKey)
      return next
    })
  }

  const selectVisibleSheets = () => {
    setSelectedSheets(new Set(visibleSheets.map((sheet) => sheet.sheetKey)))
  }

  const selectLargestSheets = () => {
    const sorted = [...allSheets].sort((left, right) => right.rowCount - left.rowCount)
    setSelectedSheets(new Set(sorted.slice(0, 5).map((sheet) => sheet.sheetKey)))
  }

  const clearSelection = () => {
    setSelectedSheets(new Set())
  }

  const handleProceed = () => {
    const selection = Array.from(selectedSheets)
      .map((sheetKey) => allSheets.find((sheet) => sheet.sheetKey === sheetKey))
      .filter((sheet): sheet is SheetRecord => Boolean(sheet))
      .map(({ name, headers, data, fileName }) => ({ name, headers, data, fileName }))

    onProceed(selection)
  }

  return (
    <div className="space-y-6">
      <Card className="card-shell rounded-[28px] border-border/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Sheet selection workspace
          </CardTitle>
          <CardDescription>
            Search the batch, isolate risky sheets, and pick the sheets that become tables in this run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <StatGrid>
            <StatCard
              label="Target database"
              value={`${databaseConfig.name} (${databaseConfig.type.toUpperCase()})`}
              icon={<Database className="h-4 w-4" />}
            />
            <StatCard
              label="Visible sheets"
              value={visibleSheets.length}
              icon={<FileSpreadsheet className="h-4 w-4" />}
              hint={riskySheetCount > 0 ? `${riskySheetCount} with risk signals` : undefined}
            />
            <StatCard
              label="Sheets in plan"
              value={selectedCount}
              icon={<TableProperties className="h-4 w-4" />}
            />
            <StatCard
              label="Rows in plan"
              value={selectedRows.toLocaleString()}
              icon={<Rows3 className="h-4 w-4" />}
            />
          </StatGrid>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchTerm(event.target.value)}
                placeholder="Search by file name or sheet name"
                className="pl-9"
              />
            </div>

            <Select value={filterMode} onValueChange={(value) => setFilterMode(value as FilterMode)}>
              <SelectTrigger className="w-full lg:w-48" aria-label="Filter sheets">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sheets</SelectItem>
                <SelectItem value="selected">Selected only</SelectItem>
                <SelectItem value="risky">Risk signals only</SelectItem>
                <SelectItem value="large">Large sheets</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
              <SelectTrigger className="w-full lg:w-48" aria-label="Sort sheets">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rows-desc">Rows: high to low</SelectItem>
                <SelectItem value="rows-asc">Rows: low to high</SelectItem>
                <SelectItem value="name">Name</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={selectVisibleSheets}>
              Select visible
            </Button>
            <Button variant="outline" size="sm" onClick={selectLargestSheets}>
              Select top 5 largest
            </Button>
            <Button variant="outline" size="sm" onClick={clearSelection}>
              Clear selection
            </Button>
          </div>

          <TableShell className="h-[28rem]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Use</TableHead>
                  <TableHead>Workbook</TableHead>
                  <TableHead>Sheet</TableHead>
                  <TableHead>Signals</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Columns</TableHead>
                  <TableHead>Strategy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleSheets.map((sheet) => {
                  const isSelected = selectedSheets.has(sheet.sheetKey)

                  return (
                    <TableRow key={sheet.sheetKey} className={isSelected ? "bg-primary/5" : ""}>
                      <TableCell>
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleSheetSelection(sheet.sheetKey)} />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{sheet.fileName}</p>
                          <p className="text-xs text-muted-foreground">Source workbook</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{sheet.name}</p>
                          <p className="text-xs text-muted-foreground">Ready for table creation</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {sheet.signalLabels.length === 0 ? (
                            <Badge variant="secondary">Clean look</Badge>
                          ) : (
                            sheet.signalLabels.map((label) => (
                              <Badge key={`${sheet.sheetKey}-${label}`} variant="outline" className="rounded-full">
                                {label}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{sheet.rowCount.toLocaleString()}</TableCell>
                      <TableCell>{sheet.headers.length}</TableCell>
                      <TableCell>
                        <Badge className="rounded-full bg-primary/90 text-primary-foreground">
                          <TableProperties className="mr-1 h-3 w-3" />
                          Create table
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableShell>

          {visibleSheets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-background/55 p-6 text-sm text-muted-foreground">
              No sheets match this search and filter. Clear the search or pick another filter to see more sheets.
            </div>
          ) : null}

          {selectedCount === 0 ? (
            <StatusAlert tone="warning">Select at least one sheet to continue into table creation.</StatusAlert>
          ) : (
            <StatusAlert tone="info">
              {selectedCount} sheet{selectedCount === 1 ? "" : "s"} will create new tables with inferred types,
              editable schema, and post-create preview verification.
            </StatusAlert>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={handleProceed} disabled={selectedCount === 0}>
              Continue to table creation
              <TableProperties className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
