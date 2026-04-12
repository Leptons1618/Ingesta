import { NextRequest, NextResponse } from 'next/server'
import { DatabaseManager, type DatabaseConfig } from '@/lib/database-manager'
import type { DataCleaningOptions } from '@/lib/data-cleaner'

type InsertExecutionOptions = {
  batchSize?: number
  continueOnChunkError?: boolean
  handleNulls?: DataCleaningOptions["handleNulls"]
  skipEmptyRows?: boolean
  trimStrings?: boolean
  convertTypes?: boolean
}

const clampBatchSize = (value: number) => Math.max(1, Math.min(10000, value))

const chunkRows = <T,>(rows: T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size))
  }
  return chunks
}

export async function POST(request: NextRequest) {
  let tableName: string = ''
  let data: any[][] = []
  let columnNames: string[] | undefined = undefined
  
  try {
    const requestData = await request.json()
    const config: DatabaseConfig = requestData.config
    tableName = requestData.tableName
    data = requestData.data
    columnNames = requestData.columnNames
    const execution: InsertExecutionOptions = requestData.execution || {}

    const batchSize = clampBatchSize(Number(execution.batchSize ?? 1000))
    const continueOnChunkError = execution.continueOnChunkError === true
    const cleaningOptions: DataCleaningOptions = {
      handleNulls: execution.handleNulls ?? 'default',
      skipEmptyRows: execution.skipEmptyRows ?? true,
      trimStrings: execution.trimStrings ?? true,
      convertTypes: execution.convertTypes ?? false,
    }

    console.log('=== INSERT DATA DEBUG ===')
    console.log('Database Config:', JSON.stringify(config, null, 2))
    console.log('Table Name:', tableName)
    console.log('Column Names:', columnNames)
    console.log('Data rows count:', data.length)
    console.log('Batch size:', batchSize)
    console.log('Continue on chunk error:', continueOnChunkError)
    console.log('Cleaning options:', cleaningOptions)
    console.log('First few rows of data:', data.slice(0, 3))
    if (data.length > 0) {
      console.log('Data structure - first row length:', data[0]?.length)
      console.log('Column names length:', columnNames?.length)
    }

    if (!config || !tableName || !Array.isArray(data)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid request payload. config, tableName, and data[] are required.',
        },
        { status: 400 },
      )
    }

    const startedAt = Date.now()
    const rowChunks = chunkRows(data, batchSize)
    let totalInsertedRows = 0
    let totalSkippedRows = 0
    const warnings: string[] = []
    const chunkErrors: Array<{ batch: number; message: string }> = []

    for (let index = 0; index < rowChunks.length; index++) {
      const chunk = rowChunks[index]
      try {
        const chunkResult = await DatabaseManager.insertDataWithCleaning(
          config,
          tableName,
          chunk,
          columnNames,
          cleaningOptions,
        )

        totalInsertedRows += chunkResult.insertedRows
        totalSkippedRows += chunkResult.skippedRows
        warnings.push(...chunkResult.warnings.map((warning) => `[Batch ${index + 1}] ${warning}`))
      } catch (chunkError) {
        const message = chunkError instanceof Error ? chunkError.message : 'Unknown batch error'
        chunkErrors.push({ batch: index + 1, message })

        if (!continueOnChunkError) {
          throw chunkError
        }
      }
    }

    const failedBatches = chunkErrors.length
    const processedBatches = rowChunks.length - failedBatches
    const partialSuccess = failedBatches > 0
    const durationMs = Date.now() - startedAt

    if (warnings.length > 0) {
      console.log('⚠️ Data cleaning warnings:', warnings)
    }
    if (chunkErrors.length > 0) {
      console.log('⚠️ Chunk processing errors:', chunkErrors)
    }

    return NextResponse.json({
      success: !partialSuccess || totalInsertedRows > 0,
      partialSuccess,
      message: `${totalInsertedRows} rows inserted successfully${totalSkippedRows > 0 ? `, ${totalSkippedRows} rows skipped due to data issues` : ''}${partialSuccess ? `, ${failedBatches} batch(es) failed` : ''}`,
      details: {
        insertedRows: totalInsertedRows,
        skippedRows: totalSkippedRows,
        warnings,
        batchSize,
        totalBatches: rowChunks.length,
        processedBatches,
        failedBatches,
        chunkErrors,
        durationMs,
        cleaningOptions,
      },
    })
  } catch (error) {
    console.error('❌ INSERT DATA ERROR:', error)
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    console.error('Table Name:', tableName)
    console.error('Data sample:', data?.slice(0, 2))
    console.error('Column Names:', columnNames)
    
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to insert data',
        debug: {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : 'No stack trace',
          tableName,
          dataSample: data?.slice(0, 2),
          columnNames,
        },
      },
      { status: 500 }
    )
  }
}
