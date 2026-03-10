"use client"

import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowLeft, ArrowRight, CheckCircle, Database, Eye, Loader2 } from "lucide-react"
import { type DatabaseConfig } from "@/lib/database-manager"

interface CreatedTable {
  tableName: string
  totalRows: number
  columns: string[]
  sampleData: any[][]
}

interface TablePreviewInterfaceProps {
  databaseConfig: DatabaseConfig
  createdTables: Array<{ tableName: string; rowCount: number }>
  onBack: () => void
  onContinue?: () => void
  showContinue?: boolean
}

export function TablePreviewInterface({
  databaseConfig,
  createdTables,
  onBack,
  onContinue,
  showContinue = false,
}: TablePreviewInterfaceProps) {
  const [selectedTableIndex, setSelectedTableIndex] = useState(0)
  const [tableData, setTableData] = useState<CreatedTable | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentTable = createdTables?.[selectedTableIndex]

  useEffect(() => {
    if (currentTable) {
      fetchTableData(currentTable.tableName)
    }
  }, [selectedTableIndex, currentTable])

  const fetchTableData = async (tableName: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/database/preview-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: databaseConfig,
          tableName,
          limit: 10,
        }),
      })

      const result = await response.json()

      if (result.success) {
        setTableData({
          tableName,
          totalRows: result.totalRows || result.data?.length || 0,
          columns: result.columns || [],
          sampleData: result.data || [],
        })
      } else {
        setError(result.message || "Failed to fetch table data")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch table data")
    } finally {
      setIsLoading(false)
    }
  }

  const nextTable = () => {
    if (selectedTableIndex < createdTables.length - 1) {
      setSelectedTableIndex(selectedTableIndex + 1)
    }
  }

  const prevTable = () => {
    if (selectedTableIndex > 0) {
      setSelectedTableIndex(selectedTableIndex - 1)
    }
  }

  if (!createdTables || createdTables.length === 0) {
    return (
      <Card className="card-shell">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="mb-3 h-8 w-8 animate-spin text-muted-foreground" />
          <span className="text-lg font-medium">Loading table previews...</span>
          <span className="mt-1 text-sm text-muted-foreground">Preparing your newly created tables</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="card-shell">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Tables created successfully
          </CardTitle>
          <CardDescription>
            Review the imported tables and verify a few rows before finishing the run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-3">
            {createdTables.map((table, index) => {
              const isSelected = index === selectedTableIndex
              return (
                <button
                  key={table.tableName}
                  type="button"
                  onClick={() => setSelectedTableIndex(index)}
                  className={`min-w-[180px] cursor-pointer rounded-xl border px-4 py-3 text-left transition-colors ${
                    isSelected ? "border-primary bg-primary/8" : "bg-card hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-semibold">{table.tableName}</p>
                      <p className="text-xs text-muted-foreground">{table.rowCount.toLocaleString()} rows</p>
                    </div>
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={prevTable} disabled={selectedTableIndex === 0}>
                <ArrowLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={nextTable}
                disabled={selectedTableIndex === createdTables.length - 1}
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <Badge variant="outline">
              Table {selectedTableIndex + 1} of {createdTables.length}
            </Badge>
          </div>

          {currentTable && (
            <Card className="card-shell bg-muted/15">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Eye className="h-4 w-4" />
                  Preview: <span className="font-mono">{currentTable.tableName}</span>
                </CardTitle>
                <CardDescription>
                  Showing first 10 rows of {currentTable.rowCount.toLocaleString()} total rows.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading table data...</span>
                  </div>
                )}

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {tableData && !isLoading && !error && tableData.columns.length > 0 && (
                  <div className="table-shell">
                    <ScrollArea className="h-96 w-full">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {tableData.columns.map((column) => (
                              <TableHead key={column} className="whitespace-nowrap font-semibold">
                                <span className="font-mono">{column}</span>
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tableData.sampleData.map((row, index) => (
                            <TableRow key={index}>
                              {Array.isArray(row) &&
                                row.map((cell, cellIndex) => (
                                  <TableCell key={cellIndex} className="max-w-56 align-top">
                                    <span className="line-clamp-2 break-words text-sm">{String(cell ?? "")}</span>
                                  </TableCell>
                                ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                )}

                {tableData && !isLoading && !error && tableData.columns.length === 0 && (
                  <Alert>
                    <AlertDescription>
                      No preview data available. The table might be empty or the preview response did not include rows.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between gap-4">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
              Back to creation
            </Button>
            {showContinue && onContinue && (
              <Button onClick={onContinue}>
                Finish run
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
