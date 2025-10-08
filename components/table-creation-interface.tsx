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
import { Loader2, Plus, Save, Eye, Database, AlertCircle, CheckCircle, Trash2, Lightbulb, Info, ArrowRight } from "lucide-react"
import { type DatabaseConfig } from "@/lib/database-manager"
import { DataTypeDetector, type TableCreationConfig, type ColumnAnalysis } from "@/lib/data-type-detector"
import { DataTransformer } from "@/lib/data-transformer"

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
  const [analysisInsights, setAnalysisInsights] = useState<string[]>([])

  const currentSheet = selectedSheets[currentSheetIndex]
  const currentConfig = tableConfigs[currentSheetIndex]

  // Auto-analyze sheets when component mounts with intelligent insights
  useEffect(() => {
    const configs = selectedSheets.map(sheet => {
      const config = DataTypeDetector.analyzeSheet(sheet.data, sheet.sheetName, sheet.headers)
      
      // Adapt types for the target database
      config.columns = config.columns.map(col => ({
        ...col,
        suggestedType: DataTypeDetector.adaptTypeForDatabase(col.suggestedType, databaseConfig.type)
      }))
      
      return config
    })
    
    setTableConfigs(configs)
    
    // Generate insights for current sheet
    if (configs[0]) {
      generateInsights(configs[0], selectedSheets[0])
    }
  }, [selectedSheets, databaseConfig.type])

  // Update insights when navigating between sheets
  useEffect(() => {
    if (currentConfig && currentSheet) {
      generateInsights(currentConfig, currentSheet)
    }
  }, [currentSheetIndex])

  const generateInsights = (config: TableCreationConfig, sheet: any) => {
    const insights: string[] = []
    
    // Data quality insights
    const totalNulls = config.columns.reduce((sum, col) => sum + col.nullCount, 0)
    const totalValues = config.columns.reduce((sum, col) => sum + col.totalCount, 0)
    const nullPercentage = (totalNulls / totalValues) * 100
    
    if (nullPercentage > 30) {
      insights.push(`⚠️ High null values detected (${nullPercentage.toFixed(1)}%). Consider data cleaning.`)
    } else if (nullPercentage > 10) {
      insights.push(`ℹ️ Moderate null values (${nullPercentage.toFixed(1)}%). Columns are set as nullable where needed.`)
    } else {
      insights.push(`✅ Good data quality detected with minimal null values (${nullPercentage.toFixed(1)}%).`)
    }
    
    // Primary key suggestions
    const uniqueColumns = config.columns.filter(col => 
      col.uniqueValues === col.totalCount - col.nullCount && col.nullCount === 0
    )
    
    if (uniqueColumns.length > 0) {
      insights.push(`🔑 Found ${uniqueColumns.length} potential primary key column(s): ${uniqueColumns.map(c => c.name).join(', ')}`)
    } else {
      insights.push(`💡 No natural primary key found. An auto-generated 'id' column will be added.`)
    }
    
    // Data type insights
    const numericCols = config.columns.filter(col => 
      col.suggestedType.includes('INT') || col.suggestedType.includes('DECIMAL') || col.suggestedType.includes('REAL')
    ).length
    
    const dateCols = config.columns.filter(col => 
      col.suggestedType.includes('DATE') || col.suggestedType.includes('TIMESTAMP')
    ).length
    
    if (numericCols > 0 || dateCols > 0) {
      insights.push(`📊 Detected ${numericCols} numeric and ${dateCols} date/time columns with auto-type detection.`)
    }
    
    // Size insights
    const largeTextCols = config.columns.filter(col => 
      col.suggestedType === 'TEXT' || col.suggestedType.includes('1000') || col.suggestedType === 'NVARCHAR(MAX)'
    )
    
    if (largeTextCols.length > 0) {
      insights.push(`📝 ${largeTextCols.length} column(s) contain long text: ${largeTextCols.map(c => c.name).slice(0, 3).join(', ')}${largeTextCols.length > 3 ? '...' : ''}`)
    }
    
    // Row count info
    insights.push(`📦 Ready to import ${sheet.data.length.toLocaleString()} rows into ${config.tableName}`)
    
    setAnalysisInsights(insights)
  }

  const updateTableConfig = (updates: Partial<TableCreationConfig>) => {
    const newConfigs = [...tableConfigs]
    newConfigs[currentSheetIndex] = { ...currentConfig, ...updates }
    setTableConfigs(newConfigs)
    
    // Regenerate insights if table name changes
    if (updates.tableName) {
      generateInsights(newConfigs[currentSheetIndex], currentSheet)
    }
  }

  const updateColumn = (columnIndex: number, updates: Partial<ColumnAnalysis>) => {
    const newColumns = [...currentConfig.columns]
    newColumns[columnIndex] = { ...newColumns[columnIndex], ...updates }
    updateTableConfig({ columns: newColumns })
  }

  const addColumn = () => {
    const newColumn: ColumnAnalysis = {
      name: `new_column_${currentConfig.columns.length + 1}`,
      suggestedType: databaseConfig.type === 'sqlite' ? 'TEXT' : 'VARCHAR(255)',
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

  const autoOptimizeTypes = () => {
    // Re-analyze with fresh detection
    const optimizedConfig = DataTypeDetector.analyzeSheet(currentSheet.data, currentSheet.sheetName, currentSheet.headers)
    
    // Adapt for database type
    optimizedConfig.columns = optimizedConfig.columns.map(col => ({
      ...col,
      suggestedType: DataTypeDetector.adaptTypeForDatabase(col.suggestedType, databaseConfig.type)
    }))
    
    // Preserve custom column names if changed
    optimizedConfig.columns = optimizedConfig.columns.map((col, idx) => ({
      ...col,
      name: currentConfig.columns[idx]?.name !== col.name ? currentConfig.columns[idx]?.name : col.name
    }))
    
    updateTableConfig(optimizedConfig)
    generateInsights(optimizedConfig, currentSheet)
  }

  const createTables = async () => {
    setIsCreating(true)
    setCreationResults([])
    
    console.log('=== TABLE CREATION STARTED ===')
    console.log('Database config:', databaseConfig)
    console.log('Tables to create:', tableConfigs.length)
    
    const results: Array<{ success: boolean; message: string; tableName: string }> = []
    let successCount = 0

    for (let i = 0; i < tableConfigs.length; i++) {
      const config = tableConfigs[i]
      const sheet = selectedSheets[i]
      
      console.log(`\n--- Creating table ${i + 1}: ${config.tableName} ---`)
      
      try {
        // Create table
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
          const errorMessage = createResult.message.toLowerCase()
          if (errorMessage.includes('already exists') || (errorMessage.includes('relation') && errorMessage.includes('exists'))) {
            results.push({
              success: false,
              message: `Table "${config.tableName}" already exists. Please choose a different name or drop the existing table.`,
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

        // Transform and insert data
        const transformedData = DataTransformer.transformDataRows(sheet.data, config.columns)
        
        const insertResponse = await fetch('/api/database/insert-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: databaseConfig,
            tableName: config.tableName,
            data: transformedData,
            columnNames: config.columns.map(col => col.name)
          }),
        })
        
        const insertResult = await insertResponse.json()
        console.log('Insert result:', insertResult)
        
        const success = insertResult.success
        results.push({
          success,
          message: success 
            ? `✅ Table "${config.tableName}" created successfully with ${insertResult.details?.insertedRows || 0} rows`
            : `❌ ${insertResult.message}`,
          tableName: config.tableName
        })
        
        if (success) {
          successCount++
          console.log(`✅ Notifying parent: table created - ${config.tableName}`)
          // Call the callback for each successful table creation
          onTableCreated(config.tableName, sheet.data)
        }
        
      } catch (error) {
        console.error(`Error creating table ${config.tableName}:`, error)
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
    console.log(`Success: ${successCount}/${tableConfigs.length}`)
    
    // If all tables were created successfully, the parent will handle navigation
    // The onTableCreated callbacks will trigger the parent to move to preview
  }

  const getDataTypeOptions = () => {
    const baseTypes = ['VARCHAR(50)', 'VARCHAR(255)', 'VARCHAR(1000)', 'TEXT', 'INT', 'BIGINT', 'DECIMAL(10,2)', 'BOOLEAN', 'DATE', 'DATETIME']
    
    if (databaseConfig.type === 'postgresql') {
      return [...baseTypes, 'SERIAL', 'TIMESTAMP', 'JSONB', 'UUID', 'SMALLINT', 'REAL', 'DOUBLE PRECISION']
    } else if (databaseConfig.type === 'mysql') {
      return [...baseTypes, 'TINYINT', 'SMALLINT', 'MEDIUMINT', 'FLOAT', 'DOUBLE', 'TIMESTAMP', 'JSON', 'ENUM']
    } else if (databaseConfig.type === 'mssql') {
      return ['NVARCHAR(50)', 'NVARCHAR(255)', 'NVARCHAR(MAX)', 'INT', 'BIGINT', 'DECIMAL(10,2)', 'BIT', 'DATE', 'DATETIME2', 'SMALLINT', 'FLOAT', 'MONEY']
    } else if (databaseConfig.type === 'sqlite') {
      return ['TEXT', 'INTEGER', 'REAL', 'BLOB', 'NUMERIC']
    }
    
    return baseTypes
  }

  if (!currentSheet || !currentConfig) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
          <span className="text-lg font-medium">Analyzing sheet data...</span>
          <span className="text-sm text-muted-foreground mt-1">Detecting data types and generating intelligent suggestions</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold">
            <Database className="w-5 h-5 text-primary" />
            Configure & Create Tables
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Intelligent table configuration for {selectedSheets.length} sheet(s). 
            Currently configuring: <strong className="font-medium">{currentSheet.fileName}</strong> → <strong className="font-medium">{currentSheet.sheetName}</strong>
            {selectedSheets.length > 1 && ` (${currentSheetIndex + 1} of ${selectedSheets.length})`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Intelligent Insights Panel */}
          <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <Lightbulb className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription>
              <div className="space-y-1.5">
                {analysisInsights.map((insight, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-sm text-blue-700 dark:text-blue-300">{insight}</span>
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>

          {/* Navigation between sheets */}
          {selectedSheets.length > 1 && (
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentSheetIndex(Math.max(0, currentSheetIndex - 1))}
                disabled={currentSheetIndex === 0}
                className="text-sm font-medium"
              >
                ← Previous Sheet
              </Button>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-sm font-medium px-3 py-1">
                  Sheet {currentSheetIndex + 1} / {selectedSheets.length}
                </Badge>
                <span className="text-sm font-normal text-muted-foreground">
                  ({selectedSheets.filter((_, idx) => idx < currentSheetIndex).length} configured)
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentSheetIndex(Math.min(selectedSheets.length - 1, currentSheetIndex + 1))}
                disabled={currentSheetIndex === selectedSheets.length - 1}
                className="text-sm font-medium"
              >
                Next Sheet →
              </Button>
            </div>
          )}

          {/* Table Configuration */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Table Name */}
            <div className="space-y-2">
              <Label htmlFor="tableName" className="flex items-center gap-2 text-sm font-medium">
                Table Name
                <Badge variant="outline" className="text-xs font-normal">
                  {databaseConfig.type.toUpperCase()}
                </Badge>
              </Label>
              <Input
                id="tableName"
                value={currentConfig.tableName}
                onChange={(e) => updateTableConfig({ tableName: e.target.value })}
                placeholder="Enter table name"
                className="font-mono text-sm"
              />
            </div>

            {/* Primary Key Selection */}
            <div className="space-y-2">
              <Label htmlFor="primaryKey" className="text-sm font-medium">Primary Key</Label>
              <Select
                value={currentConfig.primaryKey || ''}
                onValueChange={(value) => updateTableConfig({ primaryKey: value })}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select primary key column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="id" className="text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs font-normal">Auto</Badge>
                      <span className="font-mono">Auto-generated ID</span>
                    </div>
                  </SelectItem>
                  {currentConfig.columns.map((col) => (
                    <SelectItem key={col.name} value={col.name} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{col.name}</span>
                        {col.uniqueValues === col.totalCount - col.nullCount && col.nullCount === 0 && (
                          <Badge variant="secondary" className="text-xs font-normal">Unique</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center justify-between pt-2 pb-2 border-y">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={autoOptimizeTypes}
                className="flex items-center gap-2 text-sm"
              >
                <Lightbulb className="w-4 h-4" />
                <span>Auto-Optimize Types</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={addColumn}
                className="flex items-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Add Column</span>
              </Button>
            </div>
            <div className="text-sm font-medium text-muted-foreground">
              {currentConfig.columns.length} columns configured
            </div>
          </div>

          {/* Column Configuration Table */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Column Configuration</Label>
            
            <ScrollArea className="h-[450px] border rounded-lg">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[200px] text-sm font-medium">Column Name</TableHead>
                    <TableHead className="w-[180px] text-sm font-medium">Data Type</TableHead>
                    <TableHead className="w-[80px] text-center text-sm font-medium">Nullable</TableHead>
                    <TableHead className="w-[250px] text-sm font-medium">Sample Values</TableHead>
                    <TableHead className="w-[140px] text-sm font-medium">Statistics</TableHead>
                    <TableHead className="w-[80px] text-center text-sm font-medium">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentConfig.columns.map((column, index) => (
                    <TableRow key={index} className="hover:bg-muted/50">
                      <TableCell>
                        <Input
                          value={column.name}
                          onChange={(e) => updateColumn(index, { name: e.target.value })}
                          className="w-full font-mono text-sm"
                          placeholder="column_name"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={column.suggestedType}
                          onValueChange={(value) => updateColumn(index, { suggestedType: value })}
                        >
                          <SelectTrigger className="w-full text-sm">
                            <SelectValue className="font-mono text-sm">
                              <span className="font-mono text-sm">{column.suggestedType}</span>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {getDataTypeOptions().map((type) => (
                              <SelectItem key={type} value={type} className="text-sm">
                                <span className="font-mono text-sm">{type}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Switch
                            checked={column.nullable}
                            onCheckedChange={(checked) => updateColumn(index, { nullable: checked })}
                          />
                          {column.nullCount > 0 && (
                            <Badge variant="outline" className="text-xs font-normal">
                              {column.nullCount} nulls
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {column.samples.slice(0, 3).map((sample, i) => (
                            <Badge key={i} variant="secondary" className="text-xs font-normal max-w-[80px] truncate">
                              {String(sample).substring(0, 15)}
                            </Badge>
                          ))}
                          {column.samples.length > 3 && (
                            <Badge variant="outline" className="text-xs font-normal">
                              +{column.samples.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground font-normal">Unique:</span>
                            <Badge variant="outline" className="text-xs font-normal">
                              {column.uniqueValues}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground font-normal">Total:</span>
                            <Badge variant="outline" className="text-xs font-normal">
                              {column.totalCount}
                            </Badge>
                          </div>
                          {column.maxLength && (
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground font-normal">Max Len:</span>
                              <Badge variant="outline" className="text-xs font-normal">
                                {column.maxLength}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeColumn(index)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
              <Label className="text-base font-semibold">Creation Results</Label>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {creationResults.map((result, index) => (
                  <Alert 
                    key={index} 
                    variant={result.success ? "default" : "destructive"}
                    className={result.success ? "border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800" : ""}
                  >
                    {result.success ? (
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <AlertDescription className="text-sm">
                      {result.message}
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-6 border-t">
            <Button variant="outline" onClick={onCancel} disabled={isCreating} className="text-sm">
              Cancel
            </Button>
            <div className="flex items-center gap-3">
              {creationResults.length > 0 && creationResults.every(r => r.success) && (
                <Badge variant="default" className="bg-green-600 text-white px-4 py-2 text-sm font-medium">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  All tables created successfully! Navigating to preview...
                </Badge>
              )}
              {/* Only show button if not all tables are created yet */}
              {!(creationResults.length > 0 && creationResults.every(r => r.success)) && (
                <Button
                  onClick={createTables}
                  disabled={isCreating || !currentConfig.tableName || currentConfig.columns.length === 0 || (creationResults.length > 0 && creationResults.some(r => r.success))}
                  size="lg"
                  className="flex items-center gap-2 min-w-[200px] text-sm font-medium"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Creating Tables...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span>Create {selectedSheets.length} Table{selectedSheets.length > 1 ? 's' : ''}</span>
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
