"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileSpreadsheet, Database, Plus, Settings, AlertCircle, CheckCircle } from "lucide-react"
import type { ExcelFile } from "@/lib/excel-parser"
import type { DatabaseTable, DatabaseConfig } from "@/lib/database-manager"

interface SheetSelectionInterfaceProps {
  excelFiles: ExcelFile[]
  databaseTables: DatabaseTable[]
  databaseConfig: DatabaseConfig
  onProceedWithSelection: (selectedSheets: Array<{
    fileName: string
    sheetName: string
    data: any[][]
    headers: string[]
    action: 'create' | 'map'
    targetTable?: string
  }>) => void
}

export function SheetSelectionInterface({ 
  excelFiles, 
  databaseTables, 
  databaseConfig,
  onProceedWithSelection 
}: SheetSelectionInterfaceProps) {
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set())
  const [sheetActions, setSheetActions] = useState<Record<string, { action: 'create' | 'map'; targetTable?: string }>>({})

  // Get all sheets from all files
  const allSheets = excelFiles.flatMap((file) =>
    file.sheets.map((sheet) => ({
      ...sheet,
      fileName: file.name,
      sheetKey: `${file.name}::${sheet.name}`,
      fullName: `${file.name} - ${sheet.name}`,
    }))
  )

  const toggleSheetSelection = (sheetKey: string) => {
    const newSelected = new Set(selectedSheets)
    if (newSelected.has(sheetKey)) {
      newSelected.delete(sheetKey)
      const newActions = { ...sheetActions }
      delete newActions[sheetKey]
      setSheetActions(newActions)
    } else {
      newSelected.add(sheetKey)
      // Default to create table if no existing tables
      setSheetActions({
        ...sheetActions,
        [sheetKey]: {
          action: databaseTables.length === 0 ? 'create' : 'create'
        }
      })
    }
    setSelectedSheets(newSelected)
  }

  const setSheetAction = (sheetKey: string, action: 'create' | 'map', targetTable?: string) => {
    setSheetActions({
      ...sheetActions,
      [sheetKey]: { action, targetTable }
    })
  }

  const selectAllSheets = () => {
    const allSheetKeys = new Set(allSheets.map(sheet => sheet.sheetKey))
    setSelectedSheets(allSheetKeys)
    
    const newActions: Record<string, { action: 'create' | 'map'; targetTable?: string }> = {}
    allSheets.forEach(sheet => {
      newActions[sheet.sheetKey] = {
        action: databaseTables.length === 0 ? 'create' : 'create'
      }
    })
    setSheetActions(newActions)
  }

  const clearSelection = () => {
    setSelectedSheets(new Set())
    setSheetActions({})
  }

  const handleProceed = () => {
    const selection = Array.from(selectedSheets).map(sheetKey => {
      const sheet = allSheets.find(s => s.sheetKey === sheetKey)!
      const action = sheetActions[sheetKey]
      
      return {
        fileName: sheet.fileName,
        sheetName: sheet.name,
        data: sheet.data,
        headers: sheet.headers,
        action: action.action,
        targetTable: action.targetTable
      }
    })
    
    onProceedWithSelection(selection)
  }

  const selectedCount = selectedSheets.size
  const createCount = Object.values(sheetActions).filter(a => a.action === 'create').length
  const mapCount = Object.values(sheetActions).filter(a => a.action === 'map').length

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Select Sheets to Process
          </CardTitle>
          <CardDescription>
            Choose which Excel sheets to process and decide whether to create new tables or map to existing ones.
            {databaseTables.length === 0 && (
              <span className="block mt-2 text-orange-600">
                No existing tables found. All sheets will create new tables.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Selection Summary */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Badge variant="secondary">
                {selectedCount} sheet{selectedCount !== 1 ? 's' : ''} selected
              </Badge>
              {createCount > 0 && (
                <Badge variant="default">
                  {createCount} to create
                </Badge>
              )}
              {mapCount > 0 && (
                <Badge variant="outline">
                  {mapCount} to map
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={selectAllSheets}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={clearSelection}>
                Clear All
              </Button>
            </div>
          </div>

          {/* Sheet List */}
          <ScrollArea className="h-96 border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Select</TableHead>
                  <TableHead>File Name</TableHead>
                  <TableHead>Sheet Name</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Columns</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target Table</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allSheets.map((sheet) => (
                  <TableRow key={sheet.sheetKey}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedSheets.has(sheet.sheetKey)}
                        onChange={() => toggleSheetSelection(sheet.sheetKey)}
                        className="w-4 h-4"
                      />
                    </TableCell>
                    <TableCell className="font-medium">{sheet.fileName}</TableCell>
                    <TableCell>{sheet.name}</TableCell>
                    <TableCell>{sheet.data.length - 1}</TableCell>
                    <TableCell>{sheet.data[0]?.length || 0}</TableCell>
                    <TableCell>
                      {selectedSheets.has(sheet.sheetKey) ? (
                        <div className="flex gap-1">
                          <Button
                            variant={sheetActions[sheet.sheetKey]?.action === 'create' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSheetAction(sheet.sheetKey, 'create')}
                          >
                            Create Table
                          </Button>
                          {databaseTables.length > 0 && (
                            <Button
                              variant={sheetActions[sheet.sheetKey]?.action === 'map' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setSheetAction(sheet.sheetKey, 'map')}
                            >
                              Map to Existing
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {selectedSheets.has(sheet.sheetKey) && sheetActions[sheet.sheetKey]?.action === 'map' ? (
                        <select
                          className="border rounded px-2 py-1 text-sm"
                          value={sheetActions[sheet.sheetKey]?.targetTable || ''}
                          onChange={(e) => setSheetAction(sheet.sheetKey, 'map', e.target.value)}
                        >
                          <option value="">Select table...</option>
                          {databaseTables.map((table) => (
                            <option key={table.name} value={table.name}>
                              {table.name} ({table.columns.length} cols)
                            </option>
                          ))}
                        </select>
                      ) : selectedSheets.has(sheet.sheetKey) && sheetActions[sheet.sheetKey]?.action === 'create' ? (
                        <Badge variant="secondary">New table</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>

          {/* Validation Messages */}
          {selectedCount > 0 && (
            <div className="space-y-2">
              {createCount > 0 && (
                <Alert>
                  <Plus className="h-4 w-4" />
                  <AlertDescription>
                    {createCount} new table{createCount !== 1 ? 's' : ''} will be created with auto-detected column types and data insertion.
                  </AlertDescription>
                </Alert>
              )}
              {mapCount > 0 && (
                <Alert>
                  <Database className="h-4 w-4" />
                  <AlertDescription>
                    {mapCount} sheet{mapCount !== 1 ? 's' : ''} will be mapped to existing tables. Column mapping will be configured next.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Database Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Target Database</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline">{databaseConfig.type.toUpperCase()}</Badge>
                <span>{databaseConfig.name}</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">
                  {databaseTables.length} existing table{databaseTables.length !== 1 ? 's' : ''}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-between pt-4">
            <div className="text-sm text-muted-foreground">
              {selectedCount === 0 ? (
                "Select at least one sheet to proceed"
              ) : (
                `${selectedCount} sheet${selectedCount !== 1 ? 's' : ''} selected`
              )}
            </div>
            <Button
              onClick={handleProceed}
              disabled={selectedCount === 0}
              className="flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Proceed with Selection
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
