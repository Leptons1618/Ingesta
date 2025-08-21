import { NextRequest, NextResponse } from 'next/server'
import { DatabaseManager, type DatabaseConfig } from '@/lib/database-manager'
import { DataTransformer } from '@/lib/data-transformer'
import { DataTypeDetector, type TableCreationConfig } from '@/lib/data-type-detector'

export async function POST(request: NextRequest) {
  try {
    const { 
      databaseConfig, 
      tableConfig,
      sheetData
    }: { 
      databaseConfig: DatabaseConfig
      tableConfig: TableCreationConfig
      sheetData: {
        headers: string[]
        data: any[][]
      }
    } = await request.json()
    
    console.log(`🔨 [API/tables/create] Creating table: ${tableConfig.tableName}`)
    
    // Create the table
    await DatabaseManager.createTable(databaseConfig, tableConfig)
    console.log(`✅ [API/tables/create] Table created: ${tableConfig.tableName}`)
    
    // Transform and insert data
    const transformedData = DataTransformer.transformDataRows(
      sheetData.data,
      tableConfig.columns
    )
    
    console.log(`📊 [API/tables/create] Inserting ${transformedData.length} rows`)
    
    const insertResult = await DatabaseManager.insertData(
      databaseConfig,
      tableConfig.tableName,
      transformedData,
      sheetData.headers
    )
    
    console.log(`✅ [API/tables/create] Data inserted: ${insertResult.insertedRows} rows`)
    
    return NextResponse.json({
      success: true,
      tableName: tableConfig.tableName,
      insertedRows: insertResult.insertedRows,
      message: `Table '${tableConfig.tableName}' created and ${insertResult.insertedRows} rows inserted successfully`
    })
    
  } catch (error) {
    console.error(`❌ [API/tables/create] Error creating table:`, error)
    
    // Check if it's a "table already exists" error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const isTableExistsError = errorMessage.toLowerCase().includes('already exists') || 
                              errorMessage.toLowerCase().includes('duplicate table')
    
    return NextResponse.json(
      { 
        success: false, 
        message: isTableExistsError 
          ? `Table already exists. Please choose a different name or drop the existing table.`
          : `Failed to create table: ${errorMessage}`,
        isTableExistsError
      },
      { status: isTableExistsError ? 409 : 500 }
    )
  }
}
