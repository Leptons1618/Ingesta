"use client"

import { type ChangeEvent, type ReactNode, useMemo, useState } from "react"
import { AlertCircle, Database, FileSpreadsheet, Filter, Search, Settings, Sparkles, TableProperties } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { DatabaseConfig, DatabaseTable } from "@/lib/database-manager"
import type { ExcelFile } from "@/lib/excel-parser"

interface SheetSelectionInterfaceProps {
  excelFiles: ExcelFile[]
  databaseTables: DatabaseTable[]
  databaseConfig: DatabaseConfig
  onProceedWithSelection: (selectedSheets: Array<{
    fileName: string
    sheetName: string
    data: any[][]
    headers: string[]
    action: "create" | "map"
    targetTable?: string
  }>) => void
}

type FilterMode = "all" | "selected" | "risky" | "large"
type SortMode = "rows-desc" | "rows-asc" | "name"

type SheetRecord = {
  name: string
  headers: string[]
  data: any[][]
  rowCount: number
  fileName: string
  sheetKey: string
  signalLabels: string[]
}

export function SheetSelectionInterface({
  excelFiles,
  databaseTables,
  databaseConfig,
  onProceedWithSelection,
}: SheetSelectionInterfaceProps) {
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState("")
  const [filterMode, setFilterMode] = useState<FilterMode>("all")
  const [sortMode, setSortMode] = useState<SortMode>("rows-desc")

  const allSheets = useMemo<SheetRecord[]>(() => {
    return excelFiles.flatMap((file) =>
      file.sheets.map((sheet) => {
        const normalizedHeaders = sheet.headers.map((header) => String(header ?? "").trim())
        const duplicateHeaders = new Set(
          normalizedHeaders.filter((header, index) => header && normalizedHeaders.indexOf(header) !== index),
        )
        const signalLabels: string[] = []
        const rowCount = Math.max(sheet.rowCount ?? sheet.data.length - 1, 0)

        if (rowCount <= 5) {
          signalLabels.push("Tiny sheet")
        }

        if (rowCount >= 1000) {
          signalLabels.push("Large batch")
        }

        if (normalizedHeaders.some((header) => !header)) {
          signalLabels.push("Blank headers")
        }

        if (duplicateHeaders.size > 0) {
          signalLabels.push("Duplicate headers")
        }

        if (normalizedHeaders.length >= 20) {
          signalLabels.push("Wide table")
        }

        return {
          ...sheet,
          fileName: file.name,
          sheetKey: `${file.name}::${sheet.name}`,
          rowCount,
          signalLabels,
        }
      }),
    )
  }, [excelFiles])

  const visibleSheets = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    const filtered = allSheets.filter((sheet: SheetRecord) => {
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

    return filtered.sort((left: SheetRecord, right: SheetRecord) => {
      if (sortMode === "rows-asc") {
        return left.rowCount - right.rowCount
      }

      if (sortMode === "name") {
        return `${left.fileName}-${left.name}`.localeCompare(`${right.fileName}-${right.name}`)
      }

      return right.rowCount - left.rowCount
    })
  }, [allSheets, filterMode, searchTerm, selectedSheets, sortMode])

  const selectedCount = selectedSheets.size
  const selectedRows = useMemo(
    () =>
      Array.from(selectedSheets).reduce((sum, sheetKey) => {
        const sheet = allSheets.find((entry: SheetRecord) => entry.sheetKey === sheetKey)
        return sum + (sheet?.rowCount ?? 0)
      }, 0),
    [allSheets, selectedSheets],
  )

  const riskySheetCount = allSheets.filter((sheet: SheetRecord) => sheet.signalLabels.length > 0).length

  const toggleSheetSelection = (sheetKey: string) => {
    setSelectedSheets((previous: Set<string>) => {
      const next = new Set(previous)
      if (next.has(sheetKey)) {
        next.delete(sheetKey)
      } else {
        next.add(sheetKey)
      }
      return next
    })
  }

  const selectVisibleSheets = () => {
    setSelectedSheets(new Set(visibleSheets.map((sheet: SheetRecord) => sheet.sheetKey)))
  }

  const selectLargestSheets = () => {
    const sorted = [...allSheets].sort((left, right) => right.rowCount - left.rowCount)
    setSelectedSheets(new Set(sorted.slice(0, Math.min(5, sorted.length)).map((sheet) => sheet.sheetKey)))
  }

  const clearSelection = () => {
    setSelectedSheets(new Set())
  }

  const handleProceed = () => {
    const selection = Array.from(selectedSheets)
      .map((sheetKey) => allSheets.find((sheet: SheetRecord) => sheet.sheetKey === sheetKey))
      .filter((sheet): sheet is SheetRecord => Boolean(sheet))
      .map((sheet) => ({
        fileName: sheet.fileName,
        sheetName: sheet.name,
        data: sheet.data,
        headers: sheet.headers,
        action: "create" as const,
      }))

    onProceedWithSelection(selection)
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
            Search the batch, isolate risky sheets, and build a create-table plan that matches the current run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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

            <select
              value={filterMode}
              onChange={(event) => setFilterMode(event.target.value as FilterMode)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All sheets</option>
              <option value="selected">Selected only</option>
              <option value="risky">Risk signals only</option>
              <option value="large">Large sheets</option>
            </select>

            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="rows-desc">Rows: high to low</option>
              <option value="rows-asc">Rows: low to high</option>
              <option value="name">Name</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">{selectedCount} selected</Badge>
            <Badge variant="outline">{selectedRows.toLocaleString()} rows in plan</Badge>
            <Badge variant="outline">{riskySheetCount} with risk signals</Badge>
            <Badge variant="outline">{databaseTables.length} existing tables visible</Badge>
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

          {databaseTables.length > 0 && (
            <Alert>
              <Sparkles className="h-4 w-4" />
              <AlertDescription>
                Existing table mapping is being refined. The strongest supported path right now is create-and-verify for new tables in {databaseConfig.name}.
              </AlertDescription>
            </Alert>
          )}

          <div className="table-shell">
            <ScrollArea className="h-[28rem]">
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
                {visibleSheets.map((sheet: SheetRecord) => {
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
                          <p className="text-xs text-muted-foreground">Ready for table generation</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {sheet.signalLabels.length === 0 ? (
                            <Badge variant="outline" className="border-emerald-400/35 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300">
                              Clean look
                            </Badge>
                          ) : (
                            sheet.signalLabels.map((label: string) => (
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
            </ScrollArea>
          </div>

          {visibleSheets.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/80 bg-background/55 p-6 text-sm text-muted-foreground">
              No sheets match the current search and filter combination.
            </div>
          )}

          <Card className="card-shell border-border/70 bg-background/55 py-4 shadow-none">
            <CardContent className="space-y-3 px-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Filter className="h-4 w-4 text-primary" />
                Planning summary
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <SummaryPill icon={<Database className="h-4 w-4" />} label="Target database" value={`${databaseConfig.name} (${databaseConfig.type.toUpperCase()})`} />
                <SummaryPill icon={<FileSpreadsheet className="h-4 w-4" />} label="Visible sheets" value={visibleSheets.length.toString()} />
                <SummaryPill icon={<Settings className="h-4 w-4" />} label="Selected plan" value={`${selectedCount} sheet${selectedCount === 1 ? "" : "s"}`} />
              </div>
            </CardContent>
          </Card>

          {selectedCount === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Select at least one sheet to continue into table creation.</AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <TableProperties className="h-4 w-4" />
              <AlertDescription>
                {selectedCount} sheet{selectedCount === 1 ? "" : "s"} will create new tables with inferred types, editable schema, and post-create preview verification.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between gap-4 pt-2">
            <p className="text-sm text-muted-foreground">
              The create-table path is the supported primary flow for this release.
            </p>
            <Button onClick={handleProceed} disabled={selectedCount === 0} className="gap-2">
              Continue to table creation
              <TableProperties className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryPill({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/65 p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  )
}
