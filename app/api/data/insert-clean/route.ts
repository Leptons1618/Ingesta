import { NextRequest, NextResponse } from 'next/server'
import { DatabaseManager, type DatabaseConfig } from '@/lib/database-manager'
import { type DataCleaningOptions } from '@/lib/data-cleaner'

export async function POST(request: NextRequest) {
  try {
    const { 
      config, 
      tableName, 
      data, 
      columnNames,
      cleaningOptions
    }: { 
      config: DatabaseConfig
      tableName: string
      data: any[][]
      columnNames?: string[]
      cleaningOptions?: DataCleaningOptions
    } = await request.json()

    console.log('🧹 [API/data/insert-clean] Starting data insertion with cleaning')
    console.log(`Table: ${tableName}, Rows: ${data.length}`)
    console.log('Cleaning options:', cleaningOptions)

    const result = await DatabaseManager.insertDataWithCleaning(
      config,
      tableName,
      data,
      columnNames,
      cleaningOptions || {
        handleNulls: 'default',
        skipEmptyRows: true,
        trimStrings: true,
        convertTypes: false
      }
    )

    console.log(`✅ [API/data/insert-clean] Success: ${result.insertedRows} inserted, ${result.skippedRows} skipped`)
    
    if (result.warnings.length > 0) {
      console.log('⚠️ [API/data/insert-clean] Warnings:', result.warnings)
    }

    return NextResponse.json({
      success: true,
      tableName,
      insertedRows: result.insertedRows,
      skippedRows: result.skippedRows,
      warnings: result.warnings,
      message: `Successfully inserted ${result.insertedRows} rows into ${tableName}${result.skippedRows > 0 ? ` (${result.skippedRows} rows skipped)` : ''}`
    })

  } catch (error) {
    console.error('❌ [API/data/insert-clean] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to insert data',
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
