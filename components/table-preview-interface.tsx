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

  const currentTable = createdTables[selectedTableIndex]

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
        setTableData(result.data)
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Tables Created Successfully
          </CardTitle>
          <CardDescription>
            Review your newly created tables and their data. All {createdTables.length} tables have been successfully created and populated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {createdTables.map((table, index) => (
              <Card 
                key={table.tableName}
                className={`cursor-pointer transition-all ${
                  index === selectedTableIndex ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                }`}
                onClick={() => setSelectedTableIndex(index)}
              >
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">{table.tableName}</h3>
                      <p className="text-xs text-muted-foreground">{table.rowCount} rows</p>
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
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={nextTable}
                disabled={selectedTableIndex === createdTables.length - 1}
              >
                Next
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
            <Badge variant="outline">
              Table {selectedTableIndex + 1} of {createdTables.length}
            </Badge>
          </div>

          {/* Table Preview */}
          {currentTable && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Preview: {currentTable.tableName}
                </CardTitle>
                <CardDescription>
                  Showing first 10 rows of {currentTable.rowCount} total rows
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span className="ml-2">Loading table data...</span>
                  </div>
                )}

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {tableData && !isLoading && !error && (
                  <ScrollArea className="h-96 w-full">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {tableData.columns.map((column) => (
                            <TableHead key={column} className="whitespace-nowrap">
                              {column}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tableData.sampleData.map((row, index) => (
                          <TableRow key={index}>
                            {row.map((cell, cellIndex) => (
                              <TableCell key={cellIndex} className="whitespace-nowrap">
                                <Badge variant="secondary" className="max-w-32 truncate">
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
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between mt-6">
            <Button variant="outline" onClick={onBack}>
              Back to Creation
            </Button>
            <Button onClick={onContinue}>
              Continue to Next Step
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
