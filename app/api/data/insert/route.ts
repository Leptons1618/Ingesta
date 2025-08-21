import { NextRequest, NextResponse } from 'next/server'
import { DatabaseManager, type DatabaseConfig } from '@/lib/database-manager'

export async function POST(request: NextRequest) {
  try {
    const { 
      databaseConfig, 
      tableName,
      data,
      headers
    }: { 
      databaseConfig: DatabaseConfig
      tableName: string
      data: any[][]
      headers: string[]
    } = await request.json()
    
    console.log(`📊 [API/data/insert] Inserting data into: ${tableName}`)
    console.log(`Data rows: ${data.length}, Headers: ${headers.length}`)
    
    const insertResult = await DatabaseManager.insertData(
      databaseConfig,
      tableName,
      data,
      headers
    )
    
    console.log(`✅ [API/data/insert] Successfully inserted ${insertResult.insertedRows} rows`)
    
    return NextResponse.json({
      success: true,
      tableName,
      insertedRows: insertResult.insertedRows,
      message: `Successfully inserted ${insertResult.insertedRows} rows into ${tableName}`
    })
    
  } catch (error) {
    console.error('❌ [API/data/insert] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to insert data' 
      },
      { status: 500 }
    )
  }
}
