import { NextRequest, NextResponse } from 'next/server'
import { DatabaseManager, type DatabaseConfig } from '@/lib/database-manager'

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

    console.log('=== INSERT DATA DEBUG ===')
    console.log('Database Config:', JSON.stringify(config, null, 2))
    console.log('Table Name:', tableName)
    console.log('Column Names:', columnNames)
    console.log('Data rows count:', data.length)
    console.log('First few rows of data:', data.slice(0, 3))
    if (data.length > 0) {
      console.log('Data structure - first row length:', data[0]?.length)
      console.log('Column names length:', columnNames?.length)
    }

    // Use the enhanced insertion method with data cleaning
    const result = await DatabaseManager.insertDataWithCleaning(
      config,
      tableName,
      data,
      columnNames,
      {
        handleNulls: 'default',
        skipEmptyRows: true,
        trimStrings: true,
        convertTypes: false
      }
    )
    
    console.log(`✅ ${result.insertedRows} rows inserted successfully, ${result.skippedRows} rows skipped`)
    
    if (result.warnings.length > 0) {
      console.log('⚠️ Data cleaning warnings:', result.warnings)
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `${result.insertedRows} rows inserted successfully${result.skippedRows > 0 ? `, ${result.skippedRows} rows skipped due to data issues` : ''}`,
      details: result
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
          columnNames
        }
      },
      { status: 500 }
    )
  }
}
