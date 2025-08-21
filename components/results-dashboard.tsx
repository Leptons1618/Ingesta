"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Database,
  FileSpreadsheet,
  TrendingUp,
  Download,
  RefreshCw,
} from "lucide-react"
import { type OperationResult, OperationTracker } from "@/lib/operation-tracker"

interface ResultsDashboardProps {
  operationResult: OperationResult
  onStartNew: () => void
  onViewSQL?: () => void
}

export function ResultsDashboard({ operationResult, onStartNew, onViewSQL }: ResultsDashboardProps) {
  const [selectedTab, setSelectedTab] = useState("overview")

  const metrics = useMemo(
    () => ({
      successRate: OperationTracker.calculateSuccessRate(operationResult),
      throughput: OperationTracker.calculateThroughput(operationResult),
      duration: (operationResult.summary.executionTimeMs / 1000).toFixed(2),
      avgRecordsPerFile:
        operationResult.summary.filesProcessed > 0
          ? Math.round(operationResult.summary.recordsProcessed / operationResult.summary.filesProcessed)
          : 0,
    }),
    [operationResult],
  )

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case "partial":
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />
      case "failed":
        return <XCircle className="w-5 h-5 text-red-500" />
      default:
        return <Clock className="w-5 h-5 text-gray-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-500"
      case "partial":
        return "bg-yellow-500"
      case "failed":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStatusIcon(operationResult.status)}
              <div>
                <CardTitle className="text-2xl">
                  Operation{" "}
                  {operationResult.status === "success"
                    ? "Completed Successfully"
                    : operationResult.status === "partial"
                      ? "Completed with Warnings"
                      : "Failed"}
                </CardTitle>
                <CardDescription>
                  {operationResult.operation === "import" ? "Data Import" : "SQL Generation"} •
                  {operationResult.timestamp.toLocaleString()} • Duration: {metrics.duration}s
                </CardDescription>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => OperationTracker.exportReport(operationResult)}>
                <Download className="w-4 h-4 mr-2" />
                Export Report
              </Button>
              {onViewSQL && (
                <Button variant="outline" onClick={onViewSQL}>
                  <Database className="w-4 h-4 mr-2" />
                  View SQL
                </Button>
              )}
              <Button onClick={onStartNew}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Start New Operation
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <FileSpreadsheet className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{operationResult.summary.recordsProcessed.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Records Processed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{metrics.successRate.toFixed(1)}%</p>
                <p className="text-sm text-muted-foreground">Success Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{Math.round(metrics.throughput).toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Records/Second</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Database className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{operationResult.summary.tablesAffected}</p>
                <p className="text-sm text-muted-foreground">Tables Affected</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Results */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Results</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedTab} onValueChange={setSelectedTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="tables">Tables</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {/* Progress Overview */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Processing Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Files Processed</span>
                        <span>{operationResult.summary.filesProcessed}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Sheets Processed</span>
                        <span>{operationResult.summary.sheetsProcessed}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>SQL Statements</span>
                        <span>{operationResult.details.sqlStatements}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Execution Time</span>
                        <span>{metrics.duration}s</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Record Statistics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Successful</span>
                          <span className="text-green-600">
                            {operationResult.summary.recordsSuccessful.toLocaleString()}
                          </span>
                        </div>
                        <Progress
                          value={
                            (operationResult.summary.recordsSuccessful / operationResult.summary.recordsProcessed) * 100
                          }
                          className="h-2"
                        />
                      </div>

                      {operationResult.summary.recordsFailed > 0 && (
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>Failed</span>
                            <span className="text-red-600">
                              {operationResult.summary.recordsFailed.toLocaleString()}
                            </span>
                          </div>
                          <Progress
                            value={
                              (operationResult.summary.recordsFailed / operationResult.summary.recordsProcessed) * 100
                            }
                            className="h-2"
                          />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Configuration</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Database Type:</span>
                      <p className="font-medium">{operationResult.configuration.databaseType}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Database:</span>
                      <p className="font-medium">{operationResult.configuration.databaseName}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Connection:</span>
                      <p className="font-medium">{operationResult.configuration.connectionName}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Batch Size:</span>
                      <p className="font-medium">{operationResult.configuration.batchSize.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Transactions:</span>
                      <p className="font-medium">
                        {operationResult.configuration.useTransactions ? "Enabled" : "Disabled"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Operation ID:</span>
                      <p className="font-medium font-mono text-xs">{operationResult.id}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="files" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">File Processing Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>File Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Sheets</TableHead>
                          <TableHead>Records</TableHead>
                          <TableHead>Success Rate</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {operationResult.details.fileResults.map((file, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{file.fileName}</TableCell>
                            <TableCell>
                              <Badge variant={file.status === "success" ? "default" : "secondary"}>{file.status}</Badge>
                            </TableCell>
                            <TableCell>{file.sheetsProcessed}</TableCell>
                            <TableCell>{file.recordsProcessed.toLocaleString()}</TableCell>
                            <TableCell>
                              {file.recordsProcessed > 0
                                ? `${((file.recordsSuccessful / file.recordsProcessed) * 100).toFixed(1)}%`
                                : "N/A"}
                            </TableCell>
                            <TableCell>{(file.processingTimeMs / 1000).toFixed(2)}s</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tables" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Table Import Results</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Table Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Inserted</TableHead>
                          <TableHead>Updated</TableHead>
                          <TableHead>Failed</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {operationResult.details.tableResults.map((table, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{table.tableName}</TableCell>
                            <TableCell>
                              <Badge variant={table.status === "success" ? "default" : "secondary"}>
                                {table.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-green-600">{table.recordsInserted.toLocaleString()}</TableCell>
                            <TableCell className="text-blue-600">{table.recordsUpdated.toLocaleString()}</TableCell>
                            <TableCell className="text-red-600">{table.recordsFailed.toLocaleString()}</TableCell>
                            <TableCell>{(table.executionTimeMs / 1000).toFixed(2)}s</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="logs" className="space-y-4">
              {/* Warnings */}
              {operationResult.details.warnings.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <p className="font-medium">Warnings ({operationResult.details.warnings.length}):</p>
                      <ul className="list-disc list-inside space-y-1">
                        {operationResult.details.warnings.map((warning, index) => (
                          <li key={index} className="text-sm">
                            {warning}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Errors */}
              {operationResult.details.errors.length > 0 && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <p className="font-medium">Errors ({operationResult.details.errors.length}):</p>
                      <ul className="list-disc list-inside space-y-1">
                        {operationResult.details.errors.map((error, index) => (
                          <li key={index} className="text-sm">
                            {error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Success Message */}
              {operationResult.details.warnings.length === 0 && operationResult.details.errors.length === 0 && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>Operation completed successfully with no warnings or errors.</AlertDescription>
                </Alert>
              )}

              {/* Detailed Logs */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Execution Log</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-48">
                    <div className="space-y-2 font-mono text-sm">
                      <div className="text-muted-foreground">
                        [{operationResult.timestamp.toLocaleTimeString()}] Operation started
                      </div>
                      <div className="text-muted-foreground">
                        [{operationResult.timestamp.toLocaleTimeString()}] Processing{" "}
                        {operationResult.summary.filesProcessed} files
                      </div>
                      <div className="text-muted-foreground">
                        [{operationResult.timestamp.toLocaleTimeString()}] Analyzing{" "}
                        {operationResult.summary.sheetsProcessed} sheets
                      </div>
                      <div className="text-muted-foreground">
                        [{operationResult.timestamp.toLocaleTimeString()}] Generated{" "}
                        {operationResult.details.sqlStatements} SQL statements
                      </div>
                      <div className="text-green-600">
                        [{operationResult.timestamp.toLocaleTimeString()}] Successfully processed{" "}
                        {operationResult.summary.recordsSuccessful.toLocaleString()} records
                      </div>
                      {operationResult.summary.recordsFailed > 0 && (
                        <div className="text-yellow-600">
                          [{operationResult.timestamp.toLocaleTimeString()}]{" "}
                          {operationResult.summary.recordsFailed.toLocaleString()} records failed validation
                        </div>
                      )}
                      <div className="text-muted-foreground">
                        [
                        {new Date(
                          operationResult.timestamp.getTime() + operationResult.summary.executionTimeMs,
                        ).toLocaleTimeString()}
                        ] Operation completed in {metrics.duration}s
                      </div>
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
