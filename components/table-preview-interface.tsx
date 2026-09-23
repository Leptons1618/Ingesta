"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, CheckCircle2, Database, Eye } from "lucide-react"

import { ChipButton, DataTable, EmptyState, LoadingCard, StatusAlert } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { postJson } from "@/lib/api"
import type { DatabaseConfig } from "@/lib/types"

interface TablePreview {
  tableName: string
  columns: string[]
  sampleData: unknown[][]
  totalRows: number
}

interface TablePreviewInterfaceProps {
  databaseConfig: DatabaseConfig
  tables: Array<{ tableName: string; rowCount: number }>
  onBack: () => void
  onContinue: () => void
}

export function TablePreviewInterface({ databaseConfig, tables, onBack, onContinue }: TablePreviewInterfaceProps) {
  const [selectedTableIndex, setSelectedTableIndex] = useState(0)
  const [preview, setPreview] = useState<TablePreview | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentTable = tables[selectedTableIndex]
  const tableName = currentTable?.tableName

  const fetchTableData = useCallback(
    async (name: string) => {
      setIsLoading(true)
      setError(null)

      const response = await postJson<{ columns: string[]; data: unknown[][]; totalRows: number }>(
        "/api/preview-table",
        { config: databaseConfig, tableName: name, limit: 10 },
      )

      if (!response.ok) {
        setPreview(null)
        setError(response.error)
      } else {
        setPreview({
          tableName: name,
          columns: response.data.columns,
          sampleData: response.data.data,
          totalRows: response.data.totalRows,
        })
      }

      setIsLoading(false)
    },
    [databaseConfig],
  )

  useEffect(() => {
    if (!tableName) return
    void fetchTableData(tableName)
  }, [tableName, fetchTableData])

  if (tables.length === 0) {
    return (
      <EmptyState
        icon={<Database className="h-12 w-12" />}
        title="No tables to review"
        description="This run created no tables. Go back to table creation and retry the sheets that failed."
        action={
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back to table creation
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <Card className="card-shell">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Tables created successfully
          </CardTitle>
          <CardDescription>Review the imported tables and verify a few rows before finishing the run.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-3">
            {tables.map((table, index) => (
              <ChipButton
                key={table.tableName}
                selected={index === selectedTableIndex}
                onClick={() => setSelectedTableIndex(index)}
                className="min-w-[180px] px-4 py-3 text-left"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-semibold">{table.tableName}</p>
                    <p className="text-xs text-muted-foreground">{table.rowCount.toLocaleString()} rows</p>
                  </div>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </div>
              </ChipButton>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedTableIndex(selectedTableIndex - 1)}
                disabled={selectedTableIndex === 0}
              >
                <ArrowLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedTableIndex(selectedTableIndex + 1)}
                disabled={selectedTableIndex === tables.length - 1}
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <Badge variant="outline">
              Table {selectedTableIndex + 1} of {tables.length}
            </Badge>
          </div>

          {currentTable ? (
            <Card className="card-shell bg-muted/15">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Eye className="h-4 w-4" />
                  Preview: <span className="font-mono">{currentTable.tableName}</span>
                </CardTitle>
                <CardDescription>
                  Showing {preview?.sampleData.length ?? 0} of{" "}
                  {(preview?.totalRows ?? currentTable.rowCount).toLocaleString()} rows.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? <LoadingCard label="Loading table preview..." hint="Reading the first 10 rows." /> : null}

                {error ? <StatusAlert tone="error">{error}</StatusAlert> : null}

                {!isLoading && !error && preview && preview.columns.length > 0 ? (
                  <DataTable columns={preview.columns} rows={preview.sampleData} mono />
                ) : null}

                {!isLoading && !error && preview && preview.columns.length === 0 ? (
                  <StatusAlert tone="info">
                    This table has no rows to preview. Check the insert step for this sheet, then reload the preview.
                  </StatusAlert>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <div className="flex items-center justify-between gap-4">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
              Back to table creation
            </Button>
            <Button onClick={onContinue}>
              Finish run
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
