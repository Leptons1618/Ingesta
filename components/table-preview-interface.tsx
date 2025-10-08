"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Database, Eye, ArrowRight, ArrowLeft, CheckCircle } from "lucide-react"
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
  onContinue: () => void
  onBack: () => void
}

export function TablePreviewInterface({ 
  databaseConfig, 
  createdTables, 
  onContinue, 
  onBack 
}: TablePreviewInterfaceProps) {
  const [selectedTableIndex, setSelectedTableIndex] = useState(0)
  const [tableData, setTableData] = useState<CreatedTable | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentTable = createdTables?.[selectedTableIndex]

  // Fetch table data when table selection changes
  useEffect(() => {
    if (currentTable) {
      fetchTableData(currentTable.tableName)
    }
  }, [selectedTableIndex, currentTable])

  const fetchTableData = async (tableName: string) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/database/preview-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: databaseConfig,
          tableName,
          limit: 10 // Preview first 10 rows
        }),
      })

      const result = await response.json()
      
      if (result.success) {
        // Transform API response to match component's expected structure
        setTableData({
          tableName: tableName,
          totalRows: result.totalRows || result.data?.length || 0,
          columns: result.columns || [],
          sampleData: result.data || []
        })
      } else {
        setError(result.message || 'Failed to fetch table data')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch table data')
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

  // Handle empty state
  if (!createdTables || createdTables.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-3" />
          <span className="text-lg font-medium">Loading table previews...</span>
          <span className="text-sm font-normal text-muted-foreground mt-1">Preparing your newly created tables</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Tables Created Successfully
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Review your newly created tables and their data. All {createdTables.length} tables have been successfully created and populated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {createdTables.map((table, index) => (
              <Card 
                key={table.tableName}
                className={`cursor-pointer transition-all ${
                  index === selectedTableIndex 
                    ? 'ring-2 ring-primary bg-blue-50 dark:bg-blue-950' 
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => setSelectedTableIndex(index)}
              >
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-mono text-sm font-semibold">{table.tableName}</h3>
                      <p className="text-xs font-normal text-muted-foreground">{table.rowCount ?? 0} rows</p>
                    </div>
                    <Database className="w-4 h-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={prevTable}
                disabled={selectedTableIndex === 0}
                className="text-sm font-medium"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                <span>Previous</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={nextTable}
                disabled={selectedTableIndex === createdTables.length - 1}
                className="text-sm font-medium"
              >
                <span>Next</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            <Badge variant="outline" className="text-sm font-medium">
              Table {selectedTableIndex + 1} of {createdTables.length}
            </Badge>
          </div>

          {/* Table Preview */}
          {currentTable && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Eye className="w-4 h-4" />
                  <span className="text-lg font-semibold">Preview: <span className="font-mono">{currentTable.tableName}</span></span>
                </CardTitle>
                <CardDescription className="text-sm font-normal text-muted-foreground">
                  Showing first 10 rows of {currentTable.rowCount?.toLocaleString() || '0'} total rows
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span className="ml-2 text-sm font-normal text-muted-foreground">Loading table data...</span>
                  </div>
                )}

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {tableData && !isLoading && !error && tableData.columns && tableData.sampleData && (
                  <ScrollArea className="h-96 w-full">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {tableData.columns.map((column) => (
                            <TableHead key={column} className="whitespace-nowrap text-sm font-medium">
                              <span className="font-mono">{column}</span>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tableData.sampleData.map((row, index) => (
                          <TableRow key={index}>
                            {Array.isArray(row) && row.map((cell, cellIndex) => (
                              <TableCell key={cellIndex} className="whitespace-nowrap text-sm">
                                <Badge variant="secondary" className="max-w-32 truncate text-xs font-normal">
                                  {String(cell ?? '')}
                                </Badge>
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}

                {/* Show message if data structure is invalid */}
                {tableData && !isLoading && !error && (!tableData.columns || !tableData.sampleData) && (
                  <Alert>
                    <AlertDescription>
                      No preview data available. The table might be empty or the data structure is invalid.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between mt-6">
            <Button variant="outline" onClick={onBack} className="text-sm font-medium">
              <ArrowLeft className="w-4 h-4 mr-2" />
              <span>Back to Creation</span>
            </Button>
            <Button onClick={onContinue} className="text-sm font-medium">
              <span>Continue to Next Step</span>
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
