"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { FileSpreadsheet, Loader2, RefreshCw } from "lucide-react"

import { DatabaseStep } from "@/components/connections/database-step"
import { ExcelPreview } from "@/components/excel-preview"
import { FileUploadZone } from "@/components/file-upload-zone"
import { ResultsDashboard } from "@/components/results-dashboard"
import { SheetSelectionInterface } from "@/components/sheet-selection-interface"
import { TableCreationInterface } from "@/components/table-creation-interface"
import { TablePreviewInterface } from "@/components/table-preview-interface"
import { PageHeader, StatCard, StatGrid, StatusAlert, PAGE_CONTAINER } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { WorkflowGuidancePanel } from "@/components/workflow-guidance"
import { WORKFLOW_STAGES, WorkflowStepper } from "@/components/workflow-stepper"
import { parseWorkbooks } from "@/lib/excel"
import { useAppSettingsStore } from "@/lib/settings"
import { buildRunResult, ConnectionStorage, RunHistory } from "@/lib/storage"
import { buildWorkflowGuidance } from "@/lib/workflow-insights"
import type {
  CreatedTable,
  DatabaseConfig,
  FailedTable,
  OperationResult,
  ParsedWorkbook,
  SheetInput,
  TableCreationOutcome,
} from "@/lib/types"
import { cn, formatBytes } from "@/lib/utils"

export default function ImportPage() {
  const [step, setStep] = useState(1)
  const [files, setFiles] = useState<File[]>([])
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null)
  const [connections, setConnections] = useState<DatabaseConfig[]>([])
  const [connection, setConnection] = useState<DatabaseConfig | null>(null)
  const [queue, setQueue] = useState<SheetInput[]>([])
  const [created, setCreated] = useState<CreatedTable[]>([])
  const [failed, setFailed] = useState<FailedTable[]>([])
  const [outcomes, setOutcomes] = useState<TableCreationOutcome[]>([])
  const [result, setResult] = useState<OperationResult | null>(null)
  const [importDurationMs, setImportDurationMs] = useState(0)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recentRuns, setRecentRuns] = useState(0)

  const maxRunHistory = useAppSettingsStore((state) => state.retention.maxRunHistory)

  // Saved connections live in localStorage, so they can only be read on the client.
  useEffect(() => {
    setConnections(ConnectionStorage.getAll())
    setRecentRuns(RunHistory.getAll().length)
  }, [])

  const analyze = useCallback(async () => {
    if (files.length === 0) return

    setIsAnalyzing(true)
    setError(null)

    try {
      const parsed = await parseWorkbooks(files)
      setWorkbook(parsed)

      if (parsed.files.length === 0) {
        setError(parsed.errors.join(" ") || "None of the selected files contained a readable sheet")
        return
      }

      setError(parsed.errors.length > 0 ? parsed.errors.join(" ") : null)
      setStep(2)
    } catch (caught) {
      setWorkbook(null)
      setError(caught instanceof Error ? caught.message : "The selected files could not be read")
    } finally {
      setIsAnalyzing(false)
    }
  }, [files])

  const reset = useCallback(() => {
    setStep(1)
    setFiles([])
    setWorkbook(null)
    setConnection(null)
    setQueue([])
    setCreated([])
    setFailed([])
    setOutcomes([])
    setResult(null)
    setImportDurationMs(0)
    setError(null)
  }, [])

  const selectConnection = useCallback((config: DatabaseConfig) => {
    setConnection(config)
    setQueue([])
    setCreated([])
    setFailed([])
    setOutcomes([])
    setResult(null)
    setStep(4)
  }, [])

  const selectSheets = useCallback((sheets: SheetInput[]) => {
    setQueue(sheets)
    setCreated([])
    setFailed([])
    setOutcomes([])
    setError(null)
    setStep(5)
  }, [])

  const finishCreation = useCallback(
    ({
      created: createdTables,
      failed: failedTables,
      outcomes: tableOutcomes,
      elapsedMs,
    }: {
      created: CreatedTable[]
      failed: FailedTable[]
      outcomes: TableCreationOutcome[]
      elapsedMs: number
    }) => {
      setCreated(createdTables)
      setFailed(failedTables)
      setOutcomes(tableOutcomes)
      setImportDurationMs(elapsedMs)

      if (createdTables.length === 0) {
        setError("No tables were created. Fix the reported problems and try again.")
        return
      }

      setStep(6)
    },
    [],
  )

  const finishRun = useCallback(() => {
    if (!connection) return

    const run = buildRunResult({
      createdTables: created,
      failedTables: failed,
      durationMs: importDurationMs,
      config: connection,
    })

    RunHistory.record(run, maxRunHistory)
    setResult(run)
    setStep(7)
  }, [connection, created, failed, importDurationMs, maxRunHistory])

  const totals = useMemo(() => {
    const sheets = workbook?.files.reduce((count, file) => count + file.sheets.length, 0) ?? 0
    const rows =
      workbook?.files.reduce(
        (count, file) => count + file.sheets.reduce((sheetRows, sheet) => sheetRows + sheet.data.length, 0),
        0,
      ) ?? 0
    return { sheets, rows, queuedRows: queue.reduce((count, sheet) => count + sheet.data.length, 0) }
  }, [queue, workbook])

  const stats = useMemo(
    () => [
      { label: "Files", value: files.length },
      { label: "Sheets", value: totals.sheets },
      { label: "Rows", value: totals.rows },
      { label: "Tables", value: created.length },
    ],
    [created.length, files.length, totals],
  )

  const guidance = useMemo(
    () =>
      buildWorkflowGuidance({
        step,
        files: files.length,
        sheets: totals.sheets,
        rows: totals.rows,
        connectionName: connection?.name ?? null,
        connectionType: connection?.type ?? null,
        selectedSheets: queue.length,
        selectedRows: totals.queuedRows,
        createdTables: created.length,
        failedTables: failed.length,
        recentRuns,
        error,
        busy: isAnalyzing,
      }),
    [connection, created.length, error, failed.length, files.length, isAnalyzing, queue.length, recentRuns, step, totals],
  )

  const stage = WORKFLOW_STAGES[step - 1]

  return (
    <div className="text-foreground">
      <PageHeader
        title="Import workbooks"
        description="Excel to database import workflow"
        width="narrow"
        badge={<Badge variant="outline">Beta</Badge>}
        actions={
          <>
            {connection ? <Badge variant="outline">{connection.name}</Badge> : null}
            {step > 1 && step < 7 ? (
              <Button variant="outline" size="sm" onClick={reset}>
                <RefreshCw className="h-4 w-4" />
                Reset
              </Button>
            ) : null}
          </>
        }
      />

      <main className={cn(PAGE_CONTAINER.narrow, "py-8")}>
        {step < 7 ? (
          <div className="mb-8 space-y-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">{stage.title}</h2>
              <p className="text-sm text-muted-foreground">{stage.description}</p>
            </div>

            <WorkflowStepper current={step} />

            <StatGrid>
              {stats.map((stat) => (
                <StatCard key={stat.label} label={stat.label} value={stat.value.toLocaleString()} />
              ))}
            </StatGrid>

            <WorkflowGuidancePanel guidance={guidance} />
          </div>
        ) : null}

        {error && step < 7 ? (
          <StatusAlert tone="error" className="mb-6">
            {error}
          </StatusAlert>
        ) : null}

        {step === 1 ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
            <Card className="card-shell">
              <CardHeader>
                <CardTitle>Upload files</CardTitle>
                <CardDescription>Drag and drop Excel files or browse from disk.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FileUploadZone onFileUpload={setFiles} />

                {files.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Selected files</p>
                      <Badge variant="outline">
                        {formatBytes(files.reduce((total, file) => total + file.size, 0))}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {files.map((file) => (
                        <div
                          key={`${file.name}-${file.size}`}
                          className="flex items-center justify-between rounded-xl border bg-muted/25 p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{file.name}</p>
                            <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                          </div>
                          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="card-shell">
              <CardHeader>
                <CardTitle>Next</CardTitle>
                <CardDescription>Read the workbooks to list their sheets, rows, and columns.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" onClick={analyze} disabled={isAnalyzing || files.length === 0}>
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing
                    </>
                  ) : (
                    <>
                      Analyze files
                      <FileSpreadsheet className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {step === 2 && workbook ? (
          <ExcelPreview files={workbook.files} onProceed={() => setStep(3)} />
        ) : null}

        {step === 3 ? (
          <DatabaseStep
            connections={connections}
            onConnectionsChanged={setConnections}
            onComplete={selectConnection}
          />
        ) : null}

        {step === 4 && workbook && connection ? (
          <SheetSelectionInterface
            files={workbook.files}
            databaseConfig={connection}
            onProceed={selectSheets}
          />
        ) : null}

        {step === 5 && connection ? (
          <TableCreationInterface
            databaseConfig={connection}
            sheets={queue}
            onComplete={finishCreation}
            onCancel={() => setStep(4)}
          />
        ) : null}

        {step === 6 && connection ? (
          <>
            {outcomes.length > 0 ? (
              <div className="mb-6 space-y-2">
                <p className="text-sm font-medium">Import results</p>
                {outcomes.map((outcome) => (
                  <StatusAlert key={outcome.tableName} tone={outcome.success ? "success" : "error"}>
                    <span className="font-mono text-xs">{outcome.tableName}</span> — {outcome.message}
                  </StatusAlert>
                ))}
              </div>
            ) : null}
            <TablePreviewInterface
              databaseConfig={connection}
              tables={created.map((table) => ({ tableName: table.tableName, rowCount: table.rowCount }))}
              onBack={() => setStep(5)}
              onContinue={finishRun}
            />
          </>
        ) : null}

        {step === 7 && result ? <ResultsDashboard result={result} onStartNew={reset} /> : null}
      </main>
    </div>
  )
}
