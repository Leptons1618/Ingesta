export interface OperationResult {
  id: string
  timestamp: Date
  operation: "import" | "sql_generation"
  status: "success" | "partial" | "failed"
  summary: {
    filesProcessed: number
    sheetsProcessed: number
    tablesAffected: number
    recordsProcessed: number
    recordsSuccessful: number
    recordsFailed: number
    executionTimeMs: number
  }
  details: {
    fileResults: FileResult[]
    tableResults: TableResult[]
    sqlStatements: number
    warnings: string[]
    errors: string[]
  }
  configuration: {
    databaseType: string
    databaseName: string
    connectionName: string
    batchSize: number
    useTransactions: boolean
  }
}

export interface FileResult {
  fileName: string
  status: "success" | "partial" | "failed"
  sheetsProcessed: number
  recordsProcessed: number
  recordsSuccessful: number
  recordsFailed: number
  processingTimeMs: number
  errors: string[]
}

export interface TableResult {
  tableName: string
  status: "success" | "partial" | "failed"
  recordsInserted: number
  recordsUpdated: number
  recordsSkipped: number
  recordsFailed: number
  executionTimeMs: number
  errors: string[]
}

export class OperationTracker {
  private static operations: Map<string, OperationResult> = new Map()

  static createOperation(
    operation: "import" | "sql_generation",
    configuration: OperationResult["configuration"],
  ): string {
    const id = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const operationResult: OperationResult = {
      id,
      timestamp: new Date(),
      operation,
      status: "success",
      summary: {
        filesProcessed: 0,
        sheetsProcessed: 0,
        tablesAffected: 0,
        recordsProcessed: 0,
        recordsSuccessful: 0,
        recordsFailed: 0,
        executionTimeMs: 0,
      },
      details: {
        fileResults: [],
        tableResults: [],
        sqlStatements: 0,
        warnings: [],
        errors: [],
      },
      configuration,
    }

    this.operations.set(id, operationResult)
    return id
  }

  static updateOperation(id: string, updates: Partial<OperationResult>): void {
    const operation = this.operations.get(id)
    if (operation) {
      this.operations.set(id, { ...operation, ...updates })
    }
  }

  static getOperation(id: string): OperationResult | undefined {
    return this.operations.get(id)
  }

  static getAllOperations(): OperationResult[] {
    return Array.from(this.operations.values()).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
  }

  static generateMockResult(): OperationResult {
    const startTime = Date.now() - Math.random() * 30000 // Random time in last 30 seconds
    const executionTime = Math.random() * 15000 + 2000 // 2-17 seconds

    const filesProcessed = Math.floor(Math.random() * 3) + 1
    const sheetsProcessed = Math.floor(Math.random() * 8) + 2
    const recordsProcessed = Math.floor(Math.random() * 50000) + 1000
    const recordsFailed = Math.floor(recordsProcessed * (Math.random() * 0.05)) // 0-5% failure rate
    const recordsSuccessful = recordsProcessed - recordsFailed

    const fileResults: FileResult[] = Array.from({ length: filesProcessed }, (_, i) => ({
      fileName: `data_file_${i + 1}.xlsx`,
      status: Math.random() > 0.1 ? "success" : ("partial" as const),
      sheetsProcessed: Math.floor(sheetsProcessed / filesProcessed),
      recordsProcessed: Math.floor(recordsProcessed / filesProcessed),
      recordsSuccessful: Math.floor(recordsSuccessful / filesProcessed),
      recordsFailed: Math.floor(recordsFailed / filesProcessed),
      processingTimeMs: Math.floor(executionTime / filesProcessed),
      errors:
        Math.random() > 0.8 ? [`Warning: Some data types were auto-converted in ${`data_file_${i + 1}.xlsx`}`] : [],
    }))

    const tableResults: TableResult[] = [
      {
        tableName: "users",
        status: "success",
        recordsInserted: Math.floor(recordsSuccessful * 0.4),
        recordsUpdated: 0,
        recordsSkipped: 0,
        recordsFailed: Math.floor(recordsFailed * 0.4),
        executionTimeMs: Math.floor(executionTime * 0.4),
        errors: [],
      },
      {
        tableName: "orders",
        status: "success",
        recordsInserted: Math.floor(recordsSuccessful * 0.6),
        recordsUpdated: 0,
        recordsSkipped: 0,
        recordsFailed: Math.floor(recordsFailed * 0.6),
        executionTimeMs: Math.floor(executionTime * 0.6),
        errors: [],
      },
    ]

    return {
      id: `op_${Date.now()}_mock`,
      timestamp: new Date(startTime),
      operation: "import",
      status: recordsFailed > recordsProcessed * 0.1 ? "partial" : "success",
      summary: {
        filesProcessed,
        sheetsProcessed,
        tablesAffected: tableResults.length,
        recordsProcessed,
        recordsSuccessful,
        recordsFailed,
        executionTimeMs: executionTime,
      },
      details: {
        fileResults,
        tableResults,
        sqlStatements: Math.floor(recordsProcessed / 1000) + tableResults.length,
        warnings: recordsFailed > 0 ? ["Some records failed validation and were skipped"] : [],
        errors: [],
      },
      configuration: {
        databaseType: "MySQL",
        databaseName: "production_db",
        connectionName: "Main Database",
        batchSize: 1000,
        useTransactions: true,
      },
    }
  }

  static calculateSuccessRate(result: OperationResult): number {
    if (result.summary.recordsProcessed === 0) return 100
    return (result.summary.recordsSuccessful / result.summary.recordsProcessed) * 100
  }

  static calculateThroughput(result: OperationResult): number {
    if (result.summary.executionTimeMs === 0) return 0
    return (result.summary.recordsProcessed / result.summary.executionTimeMs) * 1000 // records per second
  }

  static exportReport(result: OperationResult): void {
    const report = {
      operation: result,
      generatedAt: new Date().toISOString(),
      summary: {
        successRate: this.calculateSuccessRate(result),
        throughput: this.calculateThroughput(result),
        duration: `${(result.summary.executionTimeMs / 1000).toFixed(2)}s`,
      },
    }

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `operation-report-${result.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
}
