"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Plus, Save, Eye, Database, AlertCircle, CheckCircle, Trash2 } from "lucide-react"
import { type DatabaseConfig } from "@/lib/database-manager"
import { DataTypeDetector, type TableCreationConfig, type ColumnAnalysis } from "@/lib/data-type-detector"
import { DataTransformer } from "@/lib/data-transformer"
import type { ExcelFile } from "@/lib/excel-parser"

interface TableCreationInterfaceProps {
  databaseConfig: DatabaseConfig
  selectedSheets: Array<{ 
    fileName: string
    sheetName: string 
    data: any[][]
    headers: string[]
  }>
  onTableCreated: (tableName: string, sheetData: any[][]) => void
  onCancel: () => void
}

export function TableCreationInterface({ 
  databaseConfig, 
  selectedSheets, 
  onTableCreated, 
  onCancel 
}: TableCreationInterfaceProps) {
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0)
  const [tableConfigs, setTableConfigs] = useState<TableCreationConfig[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const [creationResults, setCreationResults] = useState<Array<{ success: boolean; message: string; tableName: string }>>([])

  const currentSheet = selectedSheets[currentSheetIndex]
  const currentConfig = tableConfigs[currentSheetIndex]

  // Auto-analyze sheets when component mounts
  useEffect(() => {
    const configs = selectedSheets.map(sheet => 
      DataTypeDetector.analyzeSheet(sheet.data, sheet.sheetName, sheet.headers)
    )
    setTableConfigs(configs)
  }, [selectedSheets])

  const updateTableConfig = (updates: Partial<TableCreationConfig>) => {
    const newConfigs = [...tableConfigs]
    newConfigs[currentSheetIndex] = { ...currentConfig, ...updates }
    setTableConfigs(newConfigs)
  }

  const updateColumn = (columnIndex: number, updates: Partial<ColumnAnalysis>) => {
    const newColumns = [...currentConfig.columns]
    newColumns[columnIndex] = { ...newColumns[columnIndex], ...updates }
    updateTableConfig({ columns: newColumns })
  }

  const addColumn = () => {
    const newColumn: ColumnAnalysis = {
      name: `new_column_${currentConfig.columns.length + 1}`,
      suggestedType: 'VARCHAR(255)',
      nullable: true,
      samples: [],
      uniqueValues: 0,
      nullCount: 0,
      totalCount: 0,
    }
    updateTableConfig({ columns: [...currentConfig.columns, newColumn] })
  }

  const removeColumn = (columnIndex: number) => {
    const newColumns = currentConfig.columns.filter((_, i) => i !== columnIndex)
    updateTableConfig({ columns: newColumns })
  }

  const createTables = async () => {
    setIsCreating(true)
    setCreationResults([])
    
    console.log('=== TABLE CREATION INTERFACE DEBUG ===')
    console.log('Database config:', databaseConfig)
    console.log('Number of tables to create:', tableConfigs.length)
    console.log('Selected sheets:', selectedSheets.length)
    
    const results: Array<{ success: boolean; message: string; tableName: string }> = []

    for (let i = 0; i < tableConfigs.length; i++) {
      const config = tableConfigs[i]
      const sheet = selectedSheets[i]
      
      console.log(`\n--- Processing table ${i + 1}: ${config.tableName} ---`)
      console.log('Table config:', config)
      console.log('Sheet data rows:', sheet.data.length)
      console.log('Sheet first few rows:', sheet.data.slice(0, 3))
      
      try {
        // Create table
        console.log('Creating table with config:', {
          config: databaseConfig,
          tableConfig: config
        })
        
        const createResponse = await fetch('/api/database/create-table', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            config: databaseConfig, 
            tableConfig: config 
          }),
        })
        
        const createResult = await createResponse.json()
        console.log('Table creation result:', createResult)
        
        if (!createResult.success) {
          console.error('Table creation failed:', createResult)
          
          // Check if table already exists
          const errorMessage = createResult.message.toLowerCase()
          if (errorMessage.includes('already exists') || errorMessage.includes('relation') && errorMessage.includes('exists')) {
            results.push({
              success: false,
              message: `Table "${config.tableName}" already exists in the database. Please choose a different name or drop the existing table.`,
              tableName: config.tableName
            })
          } else {
            results.push({
              success: false,
              message: createResult.message,
              tableName: config.tableName
            })
          }
          continue
        }

        // Insert data with proper transformations
        console.log('Transforming data before insertion...')
        const transformedData = DataTransformer.transformDataRows(sheet.data, config.columns)
        
        console.log('Original data sample:', sheet.data.slice(0, 2))
        console.log('Transformed data sample:', transformedData.slice(0, 2))
        console.log('Column names for insertion:', config.columns.map(col => col.name))
        
        const insertPayload = {
          config: databaseConfig,
          tableName: config.tableName,
          data: transformedData,
          columnNames: config.columns.map(col => col.name)
        }
        
        console.log('Insert payload:', insertPayload)
        
        const insertResponse = await fetch('/api/database/insert-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(insertPayload),
        })
        
        const insertResult = await insertResponse.json()
        console.log('Insert result:', insertResult)
        
        results.push({
          success: insertResult.success,
          message: insertResult.success 
            ? `Table "${config.tableName}" created and ${insertResult.details?.insertedRows || 0} rows inserted`
            : insertResult.message,
          tableName: config.tableName
        })
        
        if (insertResult.success) {
          console.log(`✅ Calling onTableCreated for: ${config.tableName}`)
          onTableCreated(config.tableName, sheet.data)
        } else {
          console.log(`❌ Insert failed for table: ${config.tableName}`, insertResult)
        }
        
      } catch (error) {
        results.push({
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          tableName: config.tableName
        })
      }
    }
    
    setCreationResults(results)
    setIsCreating(false)
    
    console.log('=== TABLE CREATION COMPLETE ===')
    console.log('Total results:', results.length)
    console.log('Successful tables:', results.filter(r => r.success).length)
    console.log('Failed tables:', results.filter(r => !r.success).length)
    console.log('Results summary:', results.map(r => ({ table: r.tableName, success: r.success })))
  }

  const getDataTypeOptions = () => {
    const baseTypes = ['VARCHAR(50)', 'VARCHAR(255)', 'VARCHAR(1000)', 'TEXT', 'INT', 'BIGINT', 'DECIMAL(10,2)', 'BOOLEAN', 'DATE', 'DATETIME']
    
    if (databaseConfig.type === 'postgresql') {
      return [...baseTypes, 'SERIAL', 'TIMESTAMP', 'JSONB']
    } else if (databaseConfig.type === 'mysql') {
      return [...baseTypes, 'AUTO_INCREMENT', 'TIMESTAMP', 'JSON']
    } else if (databaseConfig.type === 'mssql') {
      return [...baseTypes, 'IDENTITY(1,1)', 'DATETIME2', 'NVARCHAR(MAX)']
    } else if (databaseConfig.type === 'sqlite') {
      return ['TEXT', 'INTEGER', 'REAL', 'BLOB']
    }
    
    return baseTypes
  }

  if (!currentSheet || !currentConfig) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <span className="ml-2">Analyzing sheet data...</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Create Tables from Excel Sheets
          </CardTitle>
          <CardDescription>
            Configure table structure for {selectedSheets.length} selected sheet(s). 
            Sheet {currentSheetIndex + 1} of {selectedSheets.length}: {currentSheet.fileName} - {currentSheet.sheetName}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Navigation between sheets */}
          {selectedSheets.length > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentSheetIndex(Math.max(0, currentSheetIndex - 1))}
                disabled={currentSheetIndex === 0}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                {currentSheetIndex + 1} / {selectedSheets.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentSheetIndex(Math.min(selectedSheets.length - 1, currentSheetIndex + 1))}
                disabled={currentSheetIndex === selectedSheets.length - 1}
              >
                Next
              </Button>
            </div>
          )}

          {/* Table Name */}
          <div className="space-y-2">
            <Label htmlFor="tableName">Table Name</Label>
            <Input
              id="tableName"
              value={currentConfig.tableName}
              onChange={(e) => updateTableConfig({ tableName: e.target.value })}
              placeholder="Enter table name"
            />
          </div>

          {/* Primary Key Selection */}
          <div className="space-y-2">
            <Label htmlFor="primaryKey">Primary Key</Label>
            <Select
              value={currentConfig.primaryKey || ''}
              onValueChange={(value) => updateTableConfig({ primaryKey: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select primary key column" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="id">Auto-generated ID</SelectItem>
                {currentConfig.columns.map((col) => (
                  <SelectItem key={col.name} value={col.name}>
                    {col.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Column Configuration */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Column Configuration</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={addColumn}
                className="flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Add Column
              </Button>
            </div>

            <ScrollArea className="h-96 border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Column Name</TableHead>
                    <TableHead>Data Type</TableHead>
                    <TableHead>Nullable</TableHead>
                    <TableHead>Sample Values</TableHead>
                    <TableHead>Stats</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentConfig.columns.map((column, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          value={column.name}
                          onChange={(e) => updateColumn(index, { name: e.target.value })}
                          className="w-32"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={column.suggestedType}
                          onValueChange={(value) => updateColumn(index, { suggestedType: value })}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {getDataTypeOptions().map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={column.nullable}
                          onCheckedChange={(checked) => updateColumn(index, { nullable: checked })}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {column.samples.slice(0, 3).map((sample, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {String(sample).substring(0, 20)}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          <div>Unique: {column.uniqueValues}</div>
                          <div>Nulls: {column.nullCount}</div>
                          <div>Total: {column.totalCount}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeColumn(index)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>

          {/* Creation Results */}
          {creationResults.length > 0 && (
            <div className="space-y-2">
              <Label>Creation Results</Label>
              {creationResults.map((result, index) => (
                <Alert key={index} variant={result.success ? "default" : "destructive"}>
                  {result.success ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  <AlertDescription>
                    <strong>{result.tableName}:</strong> {result.message}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              onClick={createTables}
              disabled={isCreating || !currentConfig.tableName}
              className="flex items-center gap-2"
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isCreating ? 'Creating...' : `Create ${selectedSheets.length} Table(s)`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
