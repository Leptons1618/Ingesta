"use client"

import { useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Upload, Database, FileSpreadsheet, Zap, CheckCircle, AlertCircle, Loader2, Settings, Code } from "lucide-react"
import { FileUploadZone } from "@/components/file-upload-zone"
import { ExcelPreview } from "@/components/excel-preview"
import { DatabaseConnectionForm } from "@/components/database-connection-form"
import { DatabaseConnectionList } from "@/components/database-connection-list"
import { DataMappingInterface } from "@/components/data-mapping-interface"
import { SheetSelectionInterface } from "@/components/sheet-selection-interface"
import { TableCreationInterface } from "@/components/table-creation-interface"
import { SQLGenerationInterface } from "@/components/sql-generation-interface"
import { TablePreviewInterface } from "@/components/table-preview-interface"
import { ResultsDashboard } from "@/components/results-dashboard"
import { ExcelParser, type ParsedData } from "@/lib/excel-parser"
import { type DatabaseConfig, type DatabaseTable } from "@/lib/database-manager"
import { DataTypeDetector } from "@/lib/data-type-detector"
import { ConnectionStorage } from "@/lib/connection-storage"
import type { SheetMapping } from "@/lib/data-mapper"
import { OperationTracker, type OperationResult } from "@/lib/operation-tracker"

const workflowSteps = [
  { id: 1, name: "Upload Excel", icon: Upload, status: "current" },
  { id: 2, name: "Preview Data", icon: FileSpreadsheet, status: "upcoming" },
  { id: 3, name: "Connect Database", icon: Database, status: "upcoming" },
  { id: 4, name: "Select Sheets", icon: Settings, status: "upcoming" },
  { id: 5, name: "Configure Tables", icon: Code, status: "upcoming" },
  { id: 6, name: "Preview Tables", icon: CheckCircle, status: "upcoming" },
  // { id: 7, name: "Generate SQL", icon: Code, status: "upcoming" }, // Hidden for now
]

export default function HomePage() {
  const [currentStep, setCurrentStep] = useState(1)
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [parsedData, setParsedData] = useState<ParsedData | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingError, setProcessingError] = useState<string | null>(null)
  const [savedConnections, setSavedConnections] = useState<DatabaseConfig[]>([])
  const [selectedConnection, setSelectedConnection] = useState<DatabaseConfig | null>(null)
  const [databaseTables, setDatabaseTables] = useState<DatabaseTable[]>([])
  const [selectedSheets, setSelectedSheets] = useState<Array<{
    fileName: string
    sheetName: string
    data: any[][]
    headers: string[]
    action: 'create' | 'map'
    targetTable?: string
  }>>([])
  const [sheetsForTableCreation, setSheetsForTableCreation] = useState<Array<{
    fileName: string
    sheetName: string
    data: any[][]
    headers: string[]
  }>>([])
  const [sheetsForMapping, setSheetsForMapping] = useState<Array<{
    fileName: string
    sheetName: string
    data: any[][]
    headers: string[]
    targetTable: string
  }>>([])
  const [sheetMappings, setSheetMappings] = useState<SheetMapping[]>([])
  const [operationResult, setOperationResult] = useState<OperationResult | null>(null)
  const [showSQLView, setShowSQLView] = useState(false)
  const [createdTables, setCreatedTables] = useState<Array<{
    tableName: string
    originalSheetName: string
    fileName: string
    columns: string[]
    rowCount: number
  }>>([])

  const handleFileUpload = useCallback((files: File[]) => {
    setUploadedFiles(files)
    setProcessingError(null)
  }, [])

  const handleAnalyzeFiles = useCallback(async () => {
    if (uploadedFiles.length === 0) return

    setIsProcessing(true)
    setProcessingError(null)

    try {
      const parsed = await ExcelParser.parseFiles(uploadedFiles)
      setParsedData(parsed)

      if (parsed.errors.length > 0) {
        setProcessingError(`Some files had issues: ${parsed.errors.join(", ")}`)
      }

      if (parsed.files.length > 0) {
        setCurrentStep(2)
      }
    } catch (error) {
      setProcessingError(error instanceof Error ? error.message : "Failed to analyze files")
    } finally {
      setIsProcessing(false)
    }
  }, [uploadedFiles])

    const handleProceedToDatabase = useCallback(() => {
    setCurrentStep(3)
    setSavedConnections(ConnectionStorage.getAllConnections())
  }, [])

  const handleConnectionSaved = useCallback((config: DatabaseConfig) => {
    setSavedConnections((prev) => [...prev, config])
  }, [])

  const handleConnectionRemoved = useCallback((id: string) => {
    setSavedConnections((prev) => prev.filter((conn) => conn.id !== id))
  }, [])

  const handleConnectionSelected = useCallback((config: DatabaseConfig, tables: DatabaseTable[]) => {
    setSelectedConnection(config)
    setDatabaseTables(tables)
    setCurrentStep(4) // Go to sheet selection
  }, [])

  const handleSheetSelection = useCallback((sheets: Array<{
    fileName: string
    sheetName: string
    data: any[][]
    headers: string[]
    action: 'create' | 'map'
    targetTable?: string
  }>) => {
    setSelectedSheets(sheets)
    
    // Separate sheets by action
    const forCreation = sheets
      .filter(sheet => sheet.action === 'create')
      .map(({ fileName, sheetName, data, headers }) => ({ fileName, sheetName, data, headers }))
    
    const forMapping = sheets
      .filter(sheet => sheet.action === 'map' && sheet.targetTable)
      .map(({ fileName, sheetName, data, headers, targetTable }) => ({ 
        fileName, 
        sheetName, 
        data, 
        headers,
        targetTable: targetTable! 
      }))
    
    setSheetsForTableCreation(forCreation)
    setSheetsForMapping(forMapping)
    
    // Determine next step
    if (forCreation.length > 0) {
      setCurrentStep(5) // Go to table creation
    } else if (forMapping.length > 0) {
      setCurrentStep(6) // Go directly to mapping/SQL generation
    }
  }, [])

  const handleTableCreated = useCallback((tableName: string, sheetData: any[][]) => {
    console.log(`Table created callback: ${tableName}`)
    console.log('Current sheetsForTableCreation:', sheetsForTableCreation.map(s => s.sheetName))
    
    // Find the sheet that was created
    const createdSheet = sheetsForTableCreation.find(sheet => {
      const sanitizedSheetName = DataTypeDetector.sanitizeTableName(sheet.sheetName)
      return sanitizedSheetName === tableName
    })
    
    if (createdSheet) {
      // Add to created tables list
      const newCreatedTable = {
        tableName,
        originalSheetName: createdSheet.sheetName,
        fileName: createdSheet.fileName,
        columns: createdSheet.headers,
        rowCount: sheetData.length
      }
      
      setCreatedTables(prev => [...prev, newCreatedTable])
      console.log('Added to created tables:', newCreatedTable)
    }
    
    // Find and remove the specific sheet that was created
    // The tableName is the sanitized version, so we need to match it against the sanitized sheetName
    const remainingCreation = sheetsForTableCreation.filter(sheet => {
      const sanitizedSheetName = DataTypeDetector.sanitizeTableName(sheet.sheetName)
      
      console.log(`Comparing: "${sanitizedSheetName}" vs "${tableName}"`)
      return sanitizedSheetName !== tableName
    })
    
    console.log('Remaining sheets for creation:', remainingCreation.map(s => s.sheetName))
    
    setSheetsForTableCreation(remainingCreation)
    
    // If no more tables to create, move to table preview step
    if (remainingCreation.length === 0) {
      console.log('All tables created, moving to step 6 (Preview Tables)')
      setCurrentStep(6)
    }
    // else: continue with remaining table creation (stays on step 5)
  }, [sheetsForTableCreation, sheetsForMapping])

  const handleMappingComplete = useCallback((mappings: SheetMapping[]) => {
    setSheetMappings(mappings)
    setCurrentStep(6) // Go to SQL generation
  }, [])

  const handleExecuteSQL = useCallback(
    async (statements: string[]) => {
      if (!selectedConnection) return

      setIsProcessing(true)

      try {
        // Create operation tracking
        const operationId = OperationTracker.createOperation("import", {
          databaseType: selectedConnection.type,
          databaseName: selectedConnection.database,
          connectionName: selectedConnection.name,
          batchSize: 1000,
          useTransactions: true,
        })

        // Simulate SQL execution with realistic timing
        await new Promise((resolve) => setTimeout(resolve, 3000))

        // Generate mock result for demonstration
        const result = OperationTracker.generateMockResult()
        setOperationResult(result)
        setCurrentStep(7) // Move to results view
      } catch (error) {
        setProcessingError(error instanceof Error ? error.message : "Failed to execute SQL")
      } finally {
        setIsProcessing(false)
      }
    },
    [selectedConnection],
  )

  const handleStartNew = useCallback(() => {
    // Reset all state
    setCurrentStep(1)
    setUploadedFiles([])
    setParsedData(null)
    setProcessingError(null)
    setSelectedConnection(null)
    setDatabaseTables([])
    setSelectedSheets([])
    setSheetsForTableCreation([])
    setSheetsForMapping([])
    setSheetMappings([])
    setOperationResult(null)
    setShowSQLView(false)
  }, [])

  const handleViewSQL = useCallback(() => {
    setShowSQLView(true)
    setCurrentStep(6) // Go back to SQL generation view
  }, [])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Excel Database Manager</h1>
              <p className="text-sm text-muted-foreground">Professional Excel to database operations</p>
            </div>
            <Badge variant="secondary" className="bg-accent text-accent-foreground">
              Beta
            </Badge>
          </div>
        </div>
      </header>

      {/* Workflow Progress - Hide when showing results */}
      {currentStep < 7 && (
        <div className="border-b border-border bg-card">
          <div className="container mx-auto px-6 py-6">
            <div className="flex items-center justify-between">
              {workflowSteps.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                      step.id <= currentStep
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-background border-border text-muted-foreground"
                    }`}
                  >
                    {step.id < currentStep ? <CheckCircle className="w-5 h-5" /> : <step.icon className="w-5 h-5" />}
                  </div>
                  <div className="ml-3">
                    <p
                      className={`text-sm font-medium ${
                        step.id <= currentStep ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {step.name}
                    </p>
                  </div>
                  {index < workflowSteps.length - 1 && (
                    <div className={`w-16 h-0.5 mx-6 ${step.id < currentStep ? "bg-primary" : "bg-border"}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {/* Step 1: File Upload */}
        {currentStep === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="w-5 h-5 text-primary" />
                    Upload Excel Files
                  </CardTitle>
                  <CardDescription>Upload one or more Excel files (.xlsx, .xls) to begin processing</CardDescription>
                </CardHeader>
                <CardContent>
                  <FileUploadZone onFileUpload={handleFileUpload} />

                  {uploadedFiles.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-sm font-medium text-foreground mb-3">Uploaded Files</h4>
                      <div className="space-y-2">
                        {uploadedFiles.map((file, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                            <div className="flex items-center gap-3">
                              <FileSpreadsheet className="w-4 h-4 text-primary" />
                              <span className="text-sm font-medium">{file.name}</span>
                              <Badge variant="outline" className="text-xs">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </Badge>
                            </div>
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {processingError && (
                    <Alert className="mt-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{processingError}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Quick Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Files Uploaded</span>
                    <span className="font-semibold">{uploadedFiles.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Sheets Detected</span>
                    <span className="font-semibold">{parsedData?.totalSheets || "-"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Records Found</span>
                    <span className="font-semibold">{parsedData?.totalRows?.toLocaleString() || "-"}</span>
                  </div>
                </CardContent>
              </Card>

              {uploadedFiles.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Next Steps</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" size="lg" onClick={handleAnalyzeFiles} disabled={isProcessing}>
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          Analyze Files
                          <Zap className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Data Preview */}
        {currentStep === 2 && parsedData && (
          <ExcelPreview files={parsedData.files} onProceedToMapping={handleProceedToDatabase} />
        )}

        {/* Step 3: Database Connection */}
        {currentStep === 3 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <DatabaseConnectionForm onConnectionSaved={handleConnectionSaved} />
            <DatabaseConnectionList
              connections={savedConnections}
              onConnectionRemoved={handleConnectionRemoved}
              onConnectionSelected={handleConnectionSelected}
            />
          </div>
        )}

        {/* Step 4: Sheet Selection */}
        {currentStep === 4 && parsedData && selectedConnection && (
          <SheetSelectionInterface
            excelFiles={parsedData.files}
            databaseTables={databaseTables}
            databaseConfig={selectedConnection}
            onProceedWithSelection={handleSheetSelection}
          />
        )}

        {/* Step 5: Table Creation */}
        {currentStep === 5 && selectedConnection && (
          sheetsForTableCreation.length > 0 ? (
            <TableCreationInterface
              databaseConfig={selectedConnection}
              selectedSheets={sheetsForTableCreation}
              onTableCreated={handleTableCreated}
              onCancel={() => setCurrentStep(4)} // Go back to sheet selection
            />
          ) : (
            // If no sheets for creation, show a transition message and move to preview
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <span className="ml-2">Preparing table previews...</span>
              </CardContent>
            </Card>
          )
        )}

        {/* Step 6: Table Preview */}
        {currentStep === 6 && selectedConnection && (
          <TablePreviewInterface
            databaseConfig={selectedConnection}
            createdTables={createdTables.map(table => ({
              tableName: table.tableName,
              rowCount: table.rowCount
            }))}
            onContinue={() => setCurrentStep(7)}
            onBack={() => setCurrentStep(5)}
          />
        )}

        {/* Fallback: If currentStep is 6 but no created tables yet, show loading */}
        {currentStep === 6 && selectedConnection && createdTables.length === 0 && (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <span className="ml-2">Loading table previews...</span>
            </CardContent>
          </Card>
        )}

        {/* Step 7: SQL Generation (Hidden for now) 
        {currentStep === 7 && parsedData && selectedConnection && (
          <SQLGenerationInterface
            sheetMappings={sheetMappings}
            excelFiles={parsedData.files}
            databaseTables={databaseTables}
            databaseConfig={selectedConnection}
            onExecuteSQL={handleExecuteSQL}
          />
        )}
        */}

        {/* Step 8: Results Dashboard */}
        {currentStep === 8 && operationResult && (
          <ResultsDashboard operationResult={operationResult} onStartNew={handleStartNew} onViewSQL={handleViewSQL} />
        )}
      </main>
    </div>
  )
}
