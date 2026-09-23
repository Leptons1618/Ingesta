"use client"

import { useState } from "react"
import { Database, Download, FileSpreadsheet, Gauge, RefreshCw, Table2 } from "lucide-react"

import { EmptyState, StatCard, StatGrid, StatusAlert, TableShell } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RunHistory } from "@/lib/storage"
import type { OperationResult, RunStatus } from "@/lib/types"

interface ResultsDashboardProps {
  result: OperationResult
  onStartNew: () => void
}

const STATUS_TITLE: Record<RunStatus, string> = {
  success: "Import completed",
  partial: "Import completed with warnings",
  failed: "Import failed",
}

const STATUS_TONE: Record<RunStatus, "success" | "warning" | "error"> = {
  success: "success",
  partial: "warning",
  failed: "error",
}

const STATUS_BADGE: Record<RunStatus, "default" | "secondary" | "destructive"> = {
  success: "default",
  partial: "secondary",
  failed: "destructive",
}

export function ResultsDashboard({ result, onStartNew }: ResultsDashboardProps) {
  const [selectedTab, setSelectedTab] = useState("overview")

  const { summary, details, configuration } = result
  const throughput = RunHistory.throughput(result)
  const durationSeconds = (summary.executionTimeMs / 1000).toFixed(2)
  const warnings = details.warnings
  const problems = [
    ...details.fileResults.flatMap((file) => file.errors.map((message) => ({ source: file.fileName, message }))),
    ...details.tableResults.flatMap((table) => table.errors.map((message) => ({ source: table.tableName, message }))),
  ]
  const failedTables = details.tableResults.filter((table) => table.status !== "success")

  const outcome =
    result.status === "success"
      ? `${summary.recordsProcessed.toLocaleString()} records written across ${summary.tablesAffected} tables.`
      : result.status === "partial"
        ? `${failedTables.length} of ${details.tableResults.length} tables reported problems. Fix them and run the import again.`
        : "No records were written. Read the errors on the Logs tab, then run the import again."

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                {STATUS_TITLE[result.status]}
                <Badge variant={STATUS_BADGE[result.status]}>{result.status}</Badge>
              </CardTitle>
              <CardDescription>
                {configuration.connectionName} · {configuration.databaseName} ·{" "}
                {new Date(result.timestamp).toLocaleString()} · {durationSeconds}s
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => RunHistory.download(result)}>
                <Download className="mr-2 h-4 w-4" />
                Export report
              </Button>
              <Button onClick={onStartNew}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Start new run
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <StatusAlert tone={STATUS_TONE[result.status]}>{outcome}</StatusAlert>
        </CardContent>
      </Card>

      <StatGrid>
        <StatCard
          label="Records processed"
          value={summary.recordsProcessed.toLocaleString()}
          icon={<FileSpreadsheet className="h-4 w-4" />}
        />
        <StatCard
          label="Sheets imported"
          value={`${summary.tablesAffected} of ${summary.sheetsProcessed}`}
          icon={<Table2 className="h-4 w-4" />}
          hint={failedTables.length > 0 ? `${failedTables.length} failed` : undefined}
        />
        <StatCard
          label="Records per second"
          value={throughput >= 10 ? Math.round(throughput).toLocaleString() : throughput.toFixed(1)}
          icon={<Gauge className="h-4 w-4" />}
          hint={`${durationSeconds}s total`}
        />
        <StatCard
          label="Tables affected"
          value={summary.tablesAffected}
          icon={<Database className="h-4 w-4" />}
          hint={`across ${summary.filesProcessed} file${summary.filesProcessed === 1 ? "" : "s"}`}
        />
      </StatGrid>

      <Card>
        <CardHeader>
          <CardTitle>Detailed results</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedTab} onValueChange={setSelectedTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="tables">Tables</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card className="card-shell">
                <CardHeader>
                  <CardTitle className="text-lg">Run summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Files processed</span>
                    <span className="font-medium">{summary.filesProcessed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sheets processed</span>
                    <span className="font-medium">{summary.sheetsProcessed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tables affected</span>
                    <span className="font-medium">{summary.tablesAffected}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Records processed</span>
                    <span className="font-medium">{summary.recordsProcessed.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Import time</span>
                    <span className="font-medium">{durationSeconds}s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Warnings and errors</span>
                    <span className="font-medium">
                      {warnings.length} / {problems.length}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="card-shell">
                <CardHeader>
                  <CardTitle className="text-lg">Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Database type</span>
                    <span className="font-medium">{configuration.databaseType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Database</span>
                    <span className="font-medium">{configuration.databaseName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Connection</span>
                    <span className="font-medium">{configuration.connectionName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Finished</span>
                    <span className="font-medium">{new Date(result.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Operation id</span>
                    <span className="truncate font-mono text-xs">{result.id}</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="files" className="mt-4 space-y-4">
              {details.fileResults.length === 0 ? (
                <EmptyState
                  title="No file results recorded"
                  description="This run recorded no per-file detail. The Tables and Logs tabs hold the outcome of each sheet."
                />
              ) : (
                <TableShell className="h-72">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Sheets</TableHead>
                        <TableHead>Records</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Errors</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {details.fileResults.map((file, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{file.fileName}</TableCell>
                          <TableCell>
                            <Badge variant={STATUS_BADGE[file.status]}>{file.status}</Badge>
                          </TableCell>
                          <TableCell>{file.sheetsProcessed}</TableCell>
                          <TableCell>{file.recordsProcessed.toLocaleString()}</TableCell>
                          <TableCell>{(file.processingTimeMs / 1000).toFixed(2)}s</TableCell>
                          <TableCell className="max-w-72 whitespace-normal text-sm">
                            {file.errors.length > 0 ? file.errors.join(" ") : "None"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableShell>
              )}
            </TabsContent>

            <TabsContent value="tables" className="mt-4 space-y-4">
              {details.tableResults.length === 0 ? (
                <EmptyState
                  title="No tables were written"
                  description="Nothing reached the database in this run. Fix the reported problems, then create the tables again."
                />
              ) : (
                <TableShell className="h-72">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Table</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Inserted</TableHead>
                        <TableHead>Failed</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Errors</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {details.tableResults.map((table, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-mono text-sm font-medium">{table.tableName}</TableCell>
                          <TableCell>
                            <Badge variant={STATUS_BADGE[table.status]}>{table.status}</Badge>
                          </TableCell>
                          <TableCell>{table.recordsInserted.toLocaleString()}</TableCell>
                          <TableCell>{table.recordsFailed.toLocaleString()}</TableCell>
                          <TableCell>{(table.executionTimeMs / 1000).toFixed(2)}s</TableCell>
                          <TableCell className="max-w-72 whitespace-normal text-sm">
                            {table.errors.length > 0 ? table.errors.join(" ") : "None"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableShell>
              )}
            </TabsContent>

            <TabsContent value="logs" className="mt-4 space-y-4">
              {warnings.length > 0 ? (
                <StatusAlert tone="warning">
                  <p className="font-medium">{warnings.length} warnings recorded</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </StatusAlert>
              ) : null}

              {problems.length > 0 ? (
                <StatusAlert tone="error">
                  <p className="font-medium">{problems.length} errors recorded</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {problems.map((problem, index) => (
                      <li key={index}>
                        <span className="font-mono text-xs">{problem.source}</span> — {problem.message}
                      </li>
                    ))}
                  </ul>
                </StatusAlert>
              ) : null}

              {warnings.length === 0 && problems.length === 0 ? (
                <EmptyState
                  title="No warnings or errors recorded"
                  description="Nothing was reported while this run executed. Anything the database complained about would be listed here."
                />
              ) : null}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
