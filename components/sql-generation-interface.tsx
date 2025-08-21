"use client"

import { useState, useCallback, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Code, Download, Copy, Play, Settings, Database, FileText, AlertTriangle, Loader2 } from "lucide-react"
import type { SheetMapping } from "@/lib/data-mapper"
import type { ExcelFile } from "@/lib/excel-parser"
import type { DatabaseTable, DatabaseConfig } from "@/lib/database-manager"
import { SQLGenerator, type SQLGenerationOptions, type GeneratedSQL } from "@/lib/sql-generator"

interface SQLGenerationInterfaceProps {
  sheetMappings: SheetMapping[]
  excelFiles: ExcelFile[]
  databaseTables: DatabaseTable[]
  databaseConfig: DatabaseConfig
  onExecuteSQL?: (sql: string[]) => Promise<void>
}

export function SQLGenerationInterface({
  sheetMappings,
  excelFiles,
  databaseTables,
  databaseConfig,
  onExecuteSQL,
}: SQLGenerationInterfaceProps) {
  const [options, setOptions] = useState<SQLGenerationOptions>({
    dialect: databaseConfig.type,
    includeCreateTable: false,
    includeDropTable: false,
    batchSize: 1000,
    useTransactions: true,
    onConflict: "ignore",
  })

  const [generatedSQL, setGeneratedSQL] = useState<GeneratedSQL | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [selectedTab, setSelectedTab] = useState("create")

  const handleGenerateSQL = useCallback(async () => {
    setIsGenerating(true)

    try {
      // Simulate generation delay for better UX
      await new Promise((resolve) => setTimeout(resolve, 500))

      const sql = SQLGenerator.generateSQL(sheetMappings, excelFiles, databaseTables, options)

      setGeneratedSQL(sql)

      // Auto-select appropriate tab based on content
      if (sql.createStatements.length > 0) {
        setSelectedTab("create")
      } else if (sql.insertStatements.length > 0) {
        setSelectedTab("insert")
      }
    } catch (error) {
      console.error("Failed to generate SQL:", error)
    } finally {
      setIsGenerating(false)
    }
  }, [sheetMappings, excelFiles, databaseTables, options])

  const handleCopySQL = useCallback((sql: string[]) => {
    const content = sql.join("\n")
    navigator.clipboard.writeText(content)
  }, [])

  const handleDownloadSQL = useCallback(() => {
    if (!generatedSQL) return
    SQLGenerator.exportSQL(generatedSQL, `${databaseConfig.name}-import.sql`)
  }, [generatedSQL, databaseConfig.name])

  const handleExecuteSQL = useCallback(async () => {
    if (!generatedSQL || !onExecuteSQL) return

    setIsExecuting(true)
    try {
      const allStatements = [...generatedSQL.createStatements, ...generatedSQL.insertStatements]
      await onExecuteSQL(allStatements)
    } catch (error) {
      console.error("Failed to execute SQL:", error)
    } finally {
      setIsExecuting(false)
    }
  }, [generatedSQL, onExecuteSQL])

  const stats = useMemo(() => {
    const totalMappings = sheetMappings.reduce((sum, mapping) => sum + mapping.mappings.length, 0)
    const totalRows = excelFiles.reduce((sum, file) => sum + file.totalRows, 0)

    return {
      sheetMappings: sheetMappings.length,
      columnMappings: totalMappings,
      totalRows,
      targetTables: [...new Set(sheetMappings.map((m) => m.targetTable))].length,
    }
  }, [sheetMappings, excelFiles])

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            SQL Generation Options
          </CardTitle>
          <CardDescription>Configure how SQL statements should be generated</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Database Info */}
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-4 h-4 text-primary" />
              <span className="font-medium">Target Database</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Connection:</span>
                <p className="font-medium">{databaseConfig.name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Type:</span>
                <p className="font-medium">{databaseConfig.type.toUpperCase()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Database:</span>
                <p className="font-medium">{databaseConfig.database}</p>
              </div>
            </div>
          </div>

          {/* Options Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>SQL Dialect</Label>
                <Select
                  value={options.dialect}
                  onValueChange={(value) =>
                    setOptions((prev) => ({
                      ...prev,
                      dialect: value as SQLGenerationOptions["dialect"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mysql">MySQL</SelectItem>
                    <SelectItem value="postgresql">PostgreSQL</SelectItem>
                    <SelectItem value="sqlite">SQLite</SelectItem>
                    <SelectItem value="mssql">SQL Server</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Batch Size</Label>
                <Input
                  type="number"
                  min="1"
                  max="10000"
                  value={options.batchSize}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      batchSize: Number.parseInt(e.target.value) || 1000,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">Number of rows per INSERT statement</p>
              </div>

              <div className="space-y-2">
                <Label>Conflict Resolution</Label>
                <Select
                  value={options.onConflict}
                  onValueChange={(value) =>
                    setOptions((prev) => ({
                      ...prev,
                      onConflict: value as SQLGenerationOptions["onConflict"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ignore">Ignore Conflicts</SelectItem>
                    <SelectItem value="replace">Replace Existing</SelectItem>
                    <SelectItem value="update">Update on Conflict</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="create-table"
                  checked={options.includeCreateTable}
                  onCheckedChange={(checked) =>
                    setOptions((prev) => ({
                      ...prev,
                      includeCreateTable: checked,
                    }))
                  }
                />
                <Label htmlFor="create-table">Include CREATE TABLE statements</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="drop-table"
                  checked={options.includeDropTable}
                  onCheckedChange={(checked) =>
                    setOptions((prev) => ({
                      ...prev,
                      includeDropTable: checked,
                    }))
                  }
                  disabled={!options.includeCreateTable}
                />
                <Label htmlFor="drop-table">Include DROP TABLE statements</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="transactions"
                  checked={options.useTransactions}
                  onCheckedChange={(checked) =>
                    setOptions((prev) => ({
                      ...prev,
                      useTransactions: checked,
                    }))
                  }
                />
                <Label htmlFor="transactions">Wrap in transactions</Label>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-lg font-bold text-primary">{stats.sheetMappings}</p>
              <p className="text-xs text-muted-foreground">Sheet Mappings</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-lg font-bold text-primary">{stats.columnMappings}</p>
              <p className="text-xs text-muted-foreground">Column Mappings</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-lg font-bold text-primary">{stats.totalRows.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Rows</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-lg font-bold text-primary">{stats.targetTables}</p>
              <p className="text-xs text-muted-foreground">Target Tables</p>
            </div>
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerateSQL}
            disabled={isGenerating || sheetMappings.length === 0}
            className="w-full"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating SQL...
              </>
            ) : (
              <>
                <Code className="w-4 h-4 mr-2" />
                Generate SQL Statements
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Generated SQL */}
      {generatedSQL && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Generated SQL
                </CardTitle>
                <CardDescription>
                  {generatedSQL.totalStatements} statements • {generatedSQL.estimatedRows.toLocaleString()} estimated
                  rows
                </CardDescription>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopySQL([...generatedSQL.createStatements, ...generatedSQL.insertStatements])}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy All
                </Button>

                <Button variant="outline" size="sm" onClick={handleDownloadSQL}>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>

                {onExecuteSQL && (
                  <Button size="sm" onClick={handleExecuteSQL} disabled={isExecuting}>
                    {isExecuting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Executing...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Execute
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="create" className="flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  CREATE Statements
                  <Badge variant="secondary">{generatedSQL.createStatements.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="insert" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  INSERT Statements
                  <Badge variant="secondary">{generatedSQL.insertStatements.length}</Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="create" className="space-y-4">
                {generatedSQL.createStatements.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-muted-foreground">Table creation statements</p>
                      <Button variant="outline" size="sm" onClick={() => handleCopySQL(generatedSQL.createStatements)}>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy CREATE
                      </Button>
                    </div>
                    <ScrollArea className="h-96 w-full">
                      <Textarea
                        value={generatedSQL.createStatements.join("\n\n")}
                        readOnly
                        className="min-h-96 font-mono text-sm"
                      />
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No CREATE statements generated</p>
                    <p className="text-sm text-muted-foreground">
                      Enable "Include CREATE TABLE statements" to generate table schemas
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="insert" className="space-y-4">
                {generatedSQL.insertStatements.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-muted-foreground">
                        Data insertion statements ({generatedSQL.estimatedRows.toLocaleString()} rows)
                      </p>
                      <Button variant="outline" size="sm" onClick={() => handleCopySQL(generatedSQL.insertStatements)}>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy INSERT
                      </Button>
                    </div>
                    <ScrollArea className="h-96 w-full">
                      <Textarea
                        value={generatedSQL.insertStatements.slice(0, 10).join("\n\n")}
                        readOnly
                        className="min-h-96 font-mono text-sm"
                      />
                    </ScrollArea>
                    {generatedSQL.insertStatements.length > 10 && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          Showing first 10 INSERT statements. Download the full SQL file to see all{" "}
                          {generatedSQL.insertStatements.length} statements.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No INSERT statements generated</p>
                    <p className="text-sm text-muted-foreground">Check your sheet mappings and data</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {generatedSQL && generatedSQL.warnings.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              <p className="font-medium">Warnings:</p>
              <ul className="list-disc list-inside space-y-1">
                {generatedSQL.warnings.map((warning, index) => (
                  <li key={index} className="text-sm">
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
