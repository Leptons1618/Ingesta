import { NextRequest, NextResponse } from 'next/server'
import { DatabaseManager, type DatabaseConfig } from '@/lib/database-manager'

export async function POST(request: NextRequest) {
  try {
    console.log('📊 [/insertData] Starting data insertion')
    
    const { 
      databaseConfig, 
      tableName, 
      data, 
      headers,
      useCleanInsert = true
    }: {
      databaseConfig: DatabaseConfig
      tableName: string
      data: any[][]
      headers: string[]
      useCleanInsert?: boolean
    } = await request.json()
    
    if (!databaseConfig) {
      return NextResponse.json(
        { success: false, message: 'Database config is required' },
        { status: 400 }
      )
    }
    
    if (!tableName) {
      return NextResponse.json(
        { success: false, message: 'Table name is required' },
        { status: 400 }
      )
    }
    
    if (!data || !Array.isArray(data)) {
      return NextResponse.json(
        { success: false, message: 'Data array is required' },
        { status: 400 }
      )
    }
    
    if (!headers || !Array.isArray(headers)) {
      return NextResponse.json(
        { success: false, message: 'Headers array is required' },
        { status: 400 }
      )
    }
    
    console.log(`📊 [/insertData] Inserting ${data.length} rows into table: ${tableName}`)
    
    let result
    if (useCleanInsert) {
      // Use the cleaning insert method
      result = await DatabaseManager.insertDataWithCleaning(
        databaseConfig,
        tableName,
        data,
        headers
      )
    } else {
      // Use basic insert method
      const basicResult = await DatabaseManager.insertData(
        databaseConfig,
        tableName,
        data,
        headers
      )
      // Normalize the result structure
      result = {
        insertedRows: basicResult.insertedRows,
        skippedRows: 0,
        warnings: []
      }
    }
    
    return NextResponse.json({
      success: true,
      tableName,
      insertedRows: result.insertedRows,
      skippedRows: result.skippedRows,
      warnings: result.warnings,
      cleaningUsed: useCleanInsert,
      message: `Successfully inserted ${result.insertedRows} rows into '${tableName}'`,
      endpoint: '/insertData'
    })
    
  } catch (error) {
    console.error('❌ [/insertData] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to insert data',
        endpoint: '/insertData'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/insertData',
    method: 'POST',
    description: 'Insert data into existing database table',
    parameters: {
      databaseConfig: 'DatabaseConfig object',
      tableName: 'string - name of existing table',
      data: 'array of arrays - data rows to insert',
      headers: 'array of strings - column headers',
      useCleanInsert: 'boolean - optional, default true (use data cleaning)'
    },
    usage: 'POST /insertData with JSON body',
    example: {
      databaseConfig: { type: 'postgresql', host: 'localhost', database: 'mydb' },
      tableName: 'my_table',
      headers: ['id', 'name', 'email'],
      data: [
        [1, 'John Doe', 'john@example.com'],
        [2, 'Jane Smith', 'jane@example.com']
      ],
      useCleanInsert: true
    }
  })
}
