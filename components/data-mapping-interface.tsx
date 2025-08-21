"use client"

import { useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  ArrowRight,
  Plus,
  Trash2,
  Eye,
  AlertTriangle,
  CheckCircle,
  Database,
  FileSpreadsheet,
  Settings,
  Download,
} from "lucide-react"
import type { ExcelFile } from "@/lib/excel-parser"
import type { DatabaseTable } from "@/lib/database-manager"
import { type ColumnMapping, type SheetMapping, DataMapper } from "@/lib/data-mapper"

interface DataMappingInterfaceProps {
  excelFiles: ExcelFile[]
  databaseTables: DatabaseTable[]
  onMappingComplete: (mappings: SheetMapping[]) => void
}

export function DataMappingInterface({ excelFiles, databaseTables, onMappingComplete }: DataMappingInterfaceProps) {
  const [sheetMappings, setSheetMappings] = useState<SheetMapping[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>("")
  const [selectedTable, setSelectedTable] = useState<string>("")
  const [previewData, setPreviewData] = useState<{ headers: string[]; rows: any[][] } | null>(null)

  // Get all sheets from all files
  const allSheets = excelFiles.flatMap((file) =>
    file.sheets.map((sheet) => ({
      ...sheet,
      fileName: file.name,
      fullName: `${file.name} - ${sheet.name}`,
    })),
  )

  const currentSheet = allSheets.find((sheet) => sheet.fullName === selectedSheet)
  const currentTable = databaseTables.find((table) => table.name === selectedTable)
  const currentMapping = sheetMappings.find(
    (mapping) => mapping.sheetName === selectedSheet && mapping.targetTable === selectedTable,
  )

  const handleCreateMapping = useCallback(() => {
    if (!selectedSheet || !selectedTable) return

    const newMapping: SheetMapping = {
      sheetName: selectedSheet,
      targetTable: selectedTable,
      mappings: [],
      insertMode: "insert",
    }

    setSheetMappings((prev) => {
      const filtered = prev.filter((m) => !(m.sheetName === selectedSheet && m.targetTable === selectedTable))
      return [...filtered, newMapping]
    })
  }, [selectedSheet, selectedTable])

  const handleAddColumnMapping = useCallback(
    (excelColumn: string, excelColumnIndex: number, databaseColumn: string, dataType: string, nullable: boolean) => {
      if (!currentMapping) return

      const newColumnMapping = DataMapper.createMapping(
        excelColumn,
        excelColumnIndex,
        selectedTable,
        databaseColumn,
        dataType,
        nullable,
      )

      setSheetMappings((prev) =>
        prev.map((mapping) => {
          if (mapping.sheetName === selectedSheet && mapping.targetTable === selectedTable) {
            return {
              ...mapping,
              mappings: [...mapping.mappings, newColumnMapping],
            }
          }
          return mapping
        }),
      )
    },
    [currentMapping, selectedSheet, selectedTable],
  )

  const handleRemoveColumnMapping = useCallback((mappingId: string) => {
    setSheetMappings((prev) =>
      prev.map((mapping) => ({
        ...mapping,
        mappings: mapping.mappings.filter((m) => m.id !== mappingId),
      })),
    )
  }, [])

  const handleUpdateMapping = useCallback((mappingId: string, updates: Partial<ColumnMapping>) => {
    setSheetMappings((prev) =>
      prev.map((mapping) => ({
        ...mapping,
        mappings: mapping.mappings.map((m) => (m.id === mappingId ? { ...m, ...updates } : m)),
      })),
    )
  }, [])

  const handlePreviewMapping = useCallback(() => {
    if (!currentMapping || !currentSheet) return

    const preview = DataMapper.generatePreview(currentMapping, currentSheet.data, 5)
    setPreviewData(preview)
  }, [currentMapping, currentSheet])

  const handleCompleteMapping = useCallback(() => {
    onMappingComplete(sheetMappings)
  }, [sheetMappings, onMappingComplete])

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Data Mapping Configuration
          </CardTitle>
          <CardDescription>Map Excel columns to database table columns for data import</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Excel Sheet</Label>
              <Select value={selectedSheet} onValueChange={setSelectedSheet}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sheet" />
                </SelectTrigger>
                <SelectContent>
                  {allSheets.map((sheet) => (
                    <SelectItem key={sheet.fullName} value={sheet.fullName}>
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4" />
                        <span className="truncate">{sheet.fullName}</span>
                        <Badge variant="outline" className="ml-auto">
                          {sheet.rowCount}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Database Table</Label>
              <Select value={selectedTable} onValueChange={setSelectedTable}>
                <SelectTrigger>
                  <SelectValue placeholder="Select table" />
                </SelectTrigger>
                <SelectContent>
                  {databaseTables.map((table) => (
                    <SelectItem key={table.name} value={table.name}>
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4" />
                        <span>{table.name}</span>
                        <Badge variant="outline" className="ml-auto">
                          {table.columns.length}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button onClick={handleCreateMapping} disabled={!selectedSheet || !selectedTable} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Create Mapping
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mapping Interface */}
      {currentMapping && currentSheet && currentTable && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Excel Columns */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Excel Columns</CardTitle>
              <CardDescription>
                {currentSheet.fullName} ({currentSheet.rowCount} rows)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <div className="space-y-2">
                  {currentSheet.headers.map((header, index) => {
                    const isMapped = currentMapping.mappings.some((m) => m.excelColumnIndex === index)
                    return (
                      <div
                        key={index}
                        className={`p-3 border rounded-lg ${
                          isMapped ? "bg-primary/5 border-primary/20" : "bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{header}</p>
                            <p className="text-xs text-muted-foreground">
                              Column {index + 1} • Sample: {currentSheet.data[0]?.[index] || "N/A"}
                            </p>
                          </div>
                          {isMapped && <CheckCircle className="w-4 h-4 text-primary" />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Database Columns */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Database Columns</CardTitle>
              <CardDescription>
                {currentTable.name} ({currentTable.columns.length} columns)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <div className="space-y-2">
                  {currentTable.columns.map((column) => {
                    const isMapped = currentMapping.mappings.some((m) => m.databaseColumn === column.name)
                    return (
                      <div
                        key={column.name}
                        className={`p-3 border rounded-lg ${
                          isMapped ? "bg-primary/5 border-primary/20" : "bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{column.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {column.type}
                              </Badge>
                              {column.isPrimaryKey && (
                                <Badge variant="secondary" className="text-xs">
                                  PK
                                </Badge>
                              )}
                              {!column.nullable && (
                                <Badge variant="destructive" className="text-xs">
                                  NOT NULL
                                </Badge>
                              )}
                            </div>
                          </div>
                          {isMapped && <CheckCircle className="w-4 h-4 text-primary" />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Column Mappings */}
      {currentMapping && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Column Mappings</CardTitle>
            <CardDescription>Configure how Excel columns map to database columns</CardDescription>
          </CardHeader>
          <CardContent>
            {currentMapping.mappings.length === 0 ? (
              <div className="text-center py-8">
                <ArrowRight className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No mappings created yet</p>
                <p className="text-sm text-muted-foreground">Create mappings by selecting columns from both sides</p>
              </div>
            ) : (
              <div className="space-y-4">
                {currentMapping.mappings.map((mapping) => (
                  <div key={mapping.id} className="p-4 border rounded-lg bg-card">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                      <div>
                        <p className="font-medium">{mapping.excelColumn}</p>
                        <p className="text-xs text-muted-foreground">Excel Column</p>
                      </div>

                      <ArrowRight className="w-4 h-4 text-muted-foreground mx-auto" />

                      <div>
                        <p className="font-medium">{mapping.databaseColumn}</p>
                        <p className="text-xs text-muted-foreground">{mapping.dataType}</p>
                      </div>

                      <Select
                        value={mapping.transformation}
                        onValueChange={(value) =>
                          handleUpdateMapping(mapping.id, {
                            transformation: value as ColumnMapping["transformation"],
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Transform</SelectItem>
                          <SelectItem value="uppercase">Uppercase</SelectItem>
                          <SelectItem value="lowercase">Lowercase</SelectItem>
                          <SelectItem value="trim">Trim Spaces</SelectItem>
                          <SelectItem value="date_format">Format Date</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveColumnMapping(mapping.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quick Mapping Helper */}
            {currentSheet && currentTable && (
              <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-3">Quick Mapping</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Select
                    onValueChange={(value) => {
                      const [excelColumn, indexStr] = value.split("|")
                      const index = Number.parseInt(indexStr)
                      // Store selected excel column
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Excel column" />
                    </SelectTrigger>
                    <SelectContent>
                      {currentSheet.headers.map((header, index) => (
                        <SelectItem key={index} value={`${header}|${index}`}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    onValueChange={(value) => {
                      // Store selected database column
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Database column" />
                    </SelectTrigger>
                    <SelectContent>
                      {currentTable.columns.map((column) => (
                        <SelectItem key={column.name} value={column.name}>
                          {column.name} ({column.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    onClick={() => {
                      // Add mapping logic here
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Mapping
                  </Button>

                  <Button
                    variant="outline"
                    onClick={handlePreviewMapping}
                    disabled={currentMapping.mappings.length === 0}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Preview
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {previewData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Mapping Preview</CardTitle>
            <CardDescription>Preview of how your data will be mapped (first 5 rows)</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64 w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    {previewData.headers.map((header, index) => (
                      <TableHead key={index} className="min-w-32">
                        {header}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.rows.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <TableCell key={cellIndex} className="max-w-48 truncate">
                          {cell?.toString() || <span className="text-muted-foreground">NULL</span>}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Summary and Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Mapping Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold text-primary">{sheetMappings.length}</p>
              <p className="text-sm text-muted-foreground">Sheet Mappings</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {sheetMappings.reduce((sum, mapping) => sum + mapping.mappings.length, 0)}
              </p>
              <p className="text-sm text-muted-foreground">Column Mappings</p>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold text-primary">
                {excelFiles.reduce((sum, file) => sum + file.totalRows, 0).toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground">Total Records</p>
            </div>
          </div>

          {sheetMappings.length > 0 && (
            <div className="flex gap-3">
              <Button onClick={handleCompleteMapping} className="flex-1" size="lg">
                Proceed to SQL Generation
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  const config = {
                    id: Date.now().toString(),
                    name: "Mapping Configuration",
                    excelFileName: excelFiles[0]?.name || "Unknown",
                    databaseConnection: "Current Connection",
                    sheetMappings,
                    createdAt: new Date(),
                  }
                  const json = DataMapper.exportMappingConfiguration(config)
                  const blob = new Blob([json], { type: "application/json" })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement("a")
                  a.href = url
                  a.download = "mapping-config.json"
                  a.click()
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Export Config
              </Button>
            </div>
          )}

          {sheetMappings.length === 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Create at least one sheet mapping to proceed with SQL generation.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
