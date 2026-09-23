"use client"

import { useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { EmptyState, StatusAlert, TableShell } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { postJson } from "@/lib/api"
import { analyzeSheet } from "@/lib/schema"
import { transformDataRows } from "@/lib/transform"
import type {
  ColumnAnalysis,
  CreatedTable,
  DatabaseConfig,
  DatabaseType,
  FailedTable,
  SheetInput,
  TableCreationConfig,
} from "@/lib/types"

interface TableCreationInterfaceProps {
  databaseConfig: DatabaseConfig
  sheets: SheetInput[]
  onComplete: (result: { created: CreatedTable[]; failed: FailedTable[]; elapsedMs: number }) => void
  onCancel: () => void
}

interface CreationOutcome {
  tableName: string
  success: boolean
  message: string
}

const TYPE_OPTIONS: Record<DatabaseType, string[]> = {
  mysql: [
    "VARCHAR(50)",
    "VARCHAR(255)",
    "VARCHAR(1000)",
    "TEXT",
    "TINYINT",
    "SMALLINT",
    "MEDIUMINT",
    "INT",
    "BIGINT",
    "DECIMAL(10,2)",
    "FLOAT",
    "DOUBLE",
    "BOOLEAN",
    "DATE",
    "DATETIME",
    "TIMESTAMP",
    "JSON",
  ],
  postgresql: [
    "VARCHAR(50)",
    "VARCHAR(255)",
    "VARCHAR(1000)",
    "TEXT",
    "SMALLINT",
    "INTEGER",
    "BIGINT",
    "SERIAL",
    "DECIMAL(10,2)",
    "REAL",
    "DOUBLE PRECISION",
    "BOOLEAN",
    "DATE",
    "TIMESTAMP",
    "JSONB",
    "UUID",
  ],
  sqlite: ["TEXT", "INTEGER", "REAL", "BLOB", "NUMERIC"],
  mssql: [
    "NVARCHAR(50)",
    "NVARCHAR(255)",
    "NVARCHAR(MAX)",
    "SMALLINT",
    "INT",
    "BIGINT",
    "DECIMAL(10,2)",
    "FLOAT",
    "MONEY",
    "BIT",
    "DATE",
    "DATETIME2",
  ],
}

/**
 * Plain sentences describing what the analysis found. Counts come from the
 * detected types, which the config keeps: each engine's own mapping is applied
 * only when the DDL is built.
 */
function describeSheet(config: TableCreationConfig, sheet: SheetInput): string[] {
  const nullCount = config.columns.reduce((sum, column) => sum + column.nullCount, 0)
  const totalCount = config.columns.reduce((sum, column) => sum + column.totalCount, 0)
  const nullShare = totalCount === 0 ? 0 : (nullCount / totalCount) * 100
  const share = `${nullShare.toFixed(1)}%`

  const insights = [
    nullShare > 30
      ? `${share} of the values in ${sheet.name} are empty. Clean the sheet or drop the emptiest columns before importing.`
      : nullShare > 10
        ? `${share} of the values in ${sheet.name} are empty. The affected columns are marked nullable.`
        : `${share} of the values in ${sheet.name} are empty.`,
  ]

  const candidateKeys = config.columns.filter(
    (column) => column.nullCount === 0 && column.uniqueValues === column.totalCount,
  )
  const candidates = candidateKeys.slice(0, 3).map((column) => column.name)
  insights.push(
    candidateKeys.length === 0
      ? "No column is unique across every row. Keep the primary key on Auto-generated ID."
      : candidateKeys.length > candidates.length
        ? `${candidateKeys.length} columns are unique across every row and can serve as the primary key, including ${candidates.join(", ")}.`
        : `Unique across every row, so usable as primary key: ${candidates.join(", ")}.`,
  )

  const typeOf = (column: ColumnAnalysis) => column.suggestedType.toUpperCase()
  const numericColumns = config.columns.filter((column) =>
    /INT|DECIMAL|NUMERIC|REAL|FLOAT|DOUBLE|MONEY/.test(typeOf(column)),
  ).length
  const dateColumns = config.columns.filter((column) => /DATE|TIMESTAMP/.test(typeOf(column))).length
  if (numericColumns > 0 || dateColumns > 0) {
    insights.push(`${numericColumns} numeric and ${dateColumns} date/time columns detected.`)
  }

  const longTextColumns = config.columns.filter((column) => /^TEXT|\(1000\)|MAX/.test(typeOf(column)))
  if (longTextColumns.length > 0) {
    const names = longTextColumns.slice(0, 3).map((column) => column.name)
    insights.push(
      longTextColumns.length > names.length
        ? `${longTextColumns.length} columns hold long text, including ${names.join(", ")}.`
        : `${longTextColumns.length} column${longTextColumns.length === 1 ? " holds" : "s hold"} long text: ${names.join(", ")}.`,
    )
  }

  insights.push(`Ready to import ${sheet.data.length.toLocaleString()} rows into ${config.tableName}.`)

  return insights
}

export function TableCreationInterface({
  databaseConfig,
  sheets,
  onComplete,
  onCancel,
}: TableCreationInterfaceProps) {
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0)
  const [outcomes, setOutcomes] = useState<CreationOutcome[]>([])
  const [isCreating, setIsCreating] = useState(false)
  // Columns keep the type the analysis detected. Each engine's own mapping is
  // applied when the DDL is built, so a BOOLEAN column stays a boolean here and
  // its values are still coerced as booleans.
  const [configs, setConfigs] = useState<TableCreationConfig[]>(() => sheets.map((sheet) => analyzeSheet(sheet)))

  const sheet = sheets[currentSheetIndex]
  const config = configs[currentSheetIndex]

  const insights = useMemo(() => (sheet && config ? describeSheet(config, sheet) : []), [config, sheet])

  const typeOptions = useMemo(
    () => [
      ...new Set([
        ...TYPE_OPTIONS[databaseConfig.type],
        ...configs.flatMap((item) => item.columns.map((column) => column.suggestedType)),
      ]),
    ],
    [configs, databaseConfig.type],
  )

  const updateConfig = (updates: Partial<TableCreationConfig>) => {
    setConfigs((previous) =>
      previous.map((item, index) => (index === currentSheetIndex ? { ...item, ...updates } : item)),
    )
  }

  const updateColumn = (columnIndex: number, updates: Partial<ColumnAnalysis>) => {
    updateConfig({ columns: config.columns.map((column, index) => (index === columnIndex ? { ...column, ...updates } : column)) })
  }

  const addColumn = () => {
    const column: ColumnAnalysis = {
      name: `new_column_${config.columns.length + 1}`,
      suggestedType: "VARCHAR(255)",
      nullable: true,
      samples: [],
      uniqueValues: 0,
      nullCount: 0,
      totalCount: 0,
    }
    updateConfig({ columns: [...config.columns, column] })
  }

  const removeColumn = (columnIndex: number) => {
    updateConfig({ columns: config.columns.filter((_, index) => index !== columnIndex) })
  }

  /** Re-runs detection for this sheet, keeping the table name the user typed. */
  const resetTypes = () => {
    updateConfig({ ...analyzeSheet(sheet), tableName: config.tableName })
  }

  const createTables = async () => {
    setIsCreating(true)
    setOutcomes([])

    const startedAt = Date.now()
    const created: CreatedTable[] = []
    const failed: FailedTable[] = []
    const results: CreationOutcome[] = []

    for (const [index, tableConfig] of configs.entries()) {
      const source = sheets[index]
      const columnNames = tableConfig.columns.map((column) => column.name)

      const createResponse = await postJson<{ message: string }>("/api/create-table", {
        config: databaseConfig,
        tableConfig,
      })

      if (!createResponse.ok) {
        results.push({ tableName: tableConfig.tableName, success: false, message: createResponse.error })
        failed.push({
          tableName: tableConfig.tableName,
          fileName: source.fileName,
          sheetName: source.name,
          message: createResponse.error,
        })
        continue
      }

      const insertResponse = await postJson<{ insertedRows: number }>("/api/insert-data", {
        config: databaseConfig,
        tableName: tableConfig.tableName,
        columnNames,
        data: transformDataRows(source.data, tableConfig.columns),
      })

      if (!insertResponse.ok) {
        const message = `Table created, but the rows were not inserted: ${insertResponse.error}`
        results.push({ tableName: tableConfig.tableName, success: false, message })
        failed.push({
          tableName: tableConfig.tableName,
          fileName: source.fileName,
          sheetName: source.name,
          message: insertResponse.error,
        })
        continue
      }

      results.push({
        tableName: tableConfig.tableName,
        success: true,
        message: `Created "${tableConfig.tableName}" with ${insertResponse.data.insertedRows.toLocaleString()} rows.`,
      })
      created.push({
        tableName: tableConfig.tableName,
        fileName: source.fileName,
        sheetName: source.name,
        columns: columnNames,
        rowCount: source.data.length,
      })
    }

    setOutcomes(results)
    setIsCreating(false)
    onComplete({ created, failed, elapsedMs: Date.now() - startedAt })
  }

  if (sheets.length === 0) {
    return (
      <EmptyState
        title="No sheets queued"
        description="Nothing is waiting to be imported. Go back to the sheet step and select at least one sheet."
      />
    )
  }

  const canCreate =
    configs.length > 0 && configs.every((item) => item.tableName.trim() !== "" && item.columns.length > 0)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Configure and create tables</CardTitle>
          <CardDescription>
            {sheets.length} sheet{sheets.length > 1 ? "s" : ""} queued. Editing{" "}
            <strong className="font-medium">{sheet.fileName}</strong> →{" "}
            <strong className="font-medium">{sheet.name}</strong>
            {sheets.length > 1 ? ` (${currentSheetIndex + 1} of ${sheets.length})` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <StatusAlert tone="info">
            <div className="space-y-1.5">
              {insights.map((insight, index) => (
                <p key={index} className="text-sm">
                  {insight}
                </p>
              ))}
            </div>
          </StatusAlert>

          {sheets.length > 1 && (
            <div className="flex items-center justify-between rounded-lg bg-muted p-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentSheetIndex(Math.max(0, currentSheetIndex - 1))}
                disabled={currentSheetIndex === 0}
              >
                Previous sheet
              </Button>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  Sheet {currentSheetIndex + 1} / {sheets.length}
                </Badge>
                <span className="text-sm text-muted-foreground">{sheet.name}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentSheetIndex(Math.min(sheets.length - 1, currentSheetIndex + 1))}
                disabled={currentSheetIndex === sheets.length - 1}
              >
                Next sheet
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tableName" className="flex items-center gap-2 text-sm font-medium">
                Table name
                <Badge variant="outline" className="text-xs font-normal">
                  {databaseConfig.type.toUpperCase()}
                </Badge>
              </Label>
              <Input
                id="tableName"
                value={config.tableName}
                onChange={(event) => updateConfig({ tableName: event.target.value })}
                placeholder="Enter table name"
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="primaryKey" className="text-sm font-medium">
                Primary key
              </Label>
              <Select
                value={config.primaryKey ?? "auto"}
                onValueChange={(value) => updateConfig({ primaryKey: value === "auto" ? undefined : value })}
              >
                <SelectTrigger id="primaryKey" className="text-sm">
                  <SelectValue placeholder="Select the primary key column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto" className="text-sm">
                    <span className="font-mono">Auto-generated ID</span>
                  </SelectItem>
                  {config.columns.map((column) => (
                    <SelectItem key={column.name} value={column.name} className="text-sm">
                      <span className="font-mono">{column.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between border-y py-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={resetTypes}>
                Reset to detected types
              </Button>
              <Button variant="outline" size="sm" onClick={addColumn} className="gap-2">
                <Plus className="h-4 w-4" />
                Add column
              </Button>
            </div>
            <span className="text-sm text-muted-foreground">{config.columns.length} columns configured</span>
          </div>

          <div className="space-y-3">
            <Label className="text-base font-semibold">Column configuration</Label>

            <TableShell className="h-[450px]">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-[200px]">Column name</TableHead>
                    <TableHead className="w-[180px]">Data type</TableHead>
                    <TableHead className="w-[100px] text-center">Nullable</TableHead>
                    <TableHead className="w-[250px]">Sample values</TableHead>
                    <TableHead className="w-[140px]">Statistics</TableHead>
                    <TableHead className="w-[80px] text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {config.columns.map((column, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Input
                          value={column.name}
                          onChange={(event) => updateColumn(index, { name: event.target.value })}
                          placeholder="column_name"
                          className="font-mono text-sm"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={column.suggestedType}
                          onValueChange={(value) => updateColumn(index, { suggestedType: value })}
                        >
                          <SelectTrigger className="w-full text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {typeOptions.map((type) => (
                              <SelectItem key={type} value={type} className="text-sm">
                                <span className="font-mono">{type}</span>
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
                          {column.nullCount > 0 ? (
                            <Badge variant="outline" className="text-xs font-normal">
                              {column.nullCount} nulls
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {column.samples.slice(0, 3).map((sample, sampleIndex) => (
                            <Badge
                              key={sampleIndex}
                              variant="secondary"
                              className="max-w-[120px] truncate text-xs font-normal"
                            >
                              {String(sample)}
                            </Badge>
                          ))}
                          {column.samples.length > 3 ? (
                            <Badge variant="outline" className="text-xs font-normal">
                              +{column.samples.length - 3}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Unique</span>
                            <Badge variant="outline" className="text-xs font-normal">
                              {column.uniqueValues}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Total</span>
                            <Badge variant="outline" className="text-xs font-normal">
                              {column.totalCount}
                            </Badge>
                          </div>
                          {column.maxLength ? (
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Max length</span>
                              <Badge variant="outline" className="text-xs font-normal">
                                {column.maxLength}
                              </Badge>
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeColumn(index)}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableShell>
          </div>

          {outcomes.length > 0 ? (
            <div className="space-y-3">
              <Label className="text-base font-semibold">Import results</Label>
              <div className="space-y-2">
                {outcomes.map((outcome, index) => (
                  <StatusAlert key={index} tone={outcome.success ? "success" : "error"}>
                    <span className="font-mono text-xs">{outcome.tableName}</span> — {outcome.message}
                  </StatusAlert>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between border-t pt-6">
            <Button variant="outline" onClick={onCancel} disabled={isCreating}>
              Cancel
            </Button>
            <Button onClick={createTables} disabled={isCreating || !canCreate} size="lg" className="min-w-[200px]">
              {isCreating
                ? "Creating tables"
                : `Create ${sheets.length} table${sheets.length > 1 ? "s" : ""}`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
