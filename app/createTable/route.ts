import { NextRequest, NextResponse } from 'next/server'
import { DatabaseManager, type DatabaseConfig } from '@/lib/database-manager'
import { DataTypeDetector, type TableCreationConfig } from '@/lib/data-type-detector'

export async function POST(request: NextRequest) {
  try {
    console.log('🏗️ [/createTable] Starting table creation')
    
    const { 
      databaseConfig, 
      tableConfig, 
      sheetData 
    }: {
      databaseConfig: DatabaseConfig
      tableConfig: TableCreationConfig
      sheetData: { data: any[][], headers: string[] }
    } = await request.json()
    
    if (!databaseConfig) {
      return NextResponse.json(
        { success: false, message: 'Database config is required' },
        { status: 400 }
      )
    }
    
    if (!tableConfig) {
      return NextResponse.json(
        { success: false, message: 'Table config is required' },
        { status: 400 }
      )
    }
    
    if (!sheetData || !sheetData.data || !sheetData.headers) {
      return NextResponse.json(
        { success: false, message: 'Sheet data with headers is required' },
        { status: 400 }
      )
    }
    
    console.log(`🏗️ [/createTable] Creating table: ${tableConfig.tableName}`)
    
    // Create the table
    await DatabaseManager.createTable(databaseConfig, tableConfig)
    console.log(`✅ [/createTable] Table created successfully`)
    
    // Insert the data
    console.log(`📊 [/createTable] Inserting ${sheetData.data.length} rows`)
    const insertResult = await DatabaseManager.insertDataWithCleaning(
      databaseConfig,
      tableConfig.tableName,
      sheetData.data,
      sheetData.headers
    )
    
    return NextResponse.json({
      success: true,
      tableName: tableConfig.tableName,
      created: true,
      insertedRows: insertResult.insertedRows,
      skippedRows: insertResult.skippedRows,
      warnings: insertResult.warnings,
      message: `Successfully created table '${tableConfig.tableName}' and inserted ${insertResult.insertedRows} rows`,
      endpoint: '/createTable'
    })
    
  } catch (error) {
    console.error('❌ [/createTable] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to create table',
        endpoint: '/createTable'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/createTable',
    method: 'POST',
    description: 'Create database table and insert data',
    parameters: {
      databaseConfig: 'DatabaseConfig object',
      tableConfig: 'TableCreationConfig object with table structure',
      sheetData: 'Object with data array and headers array'
    },
    usage: 'POST /createTable with JSON body',
    example: {
      databaseConfig: { type: 'postgresql', host: 'localhost', database: 'mydb' },
      tableConfig: { 
        tableName: 'my_table',
        columns: [
          { name: 'id', suggestedType: 'INTEGER', nullable: false },
          { name: 'name', suggestedType: 'VARCHAR(255)', nullable: true }
        ]
      },
      sheetData: {
        headers: ['id', 'name'],
        data: [[1, 'John'], [2, 'Jane']]
      }
    }
  })
}
