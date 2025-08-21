import { NextRequest, NextResponse } from 'next/server'
import { DatabaseManager, type DatabaseConfig } from '@/lib/database-manager'
import { type TableCreationConfig } from '@/lib/data-type-detector'

export async function POST(request: NextRequest) {
  try {
    const { config, tableConfig }: { 
      config: DatabaseConfig
      tableConfig: TableCreationConfig 
    } = await request.json()

    console.log('=== CREATE TABLE DEBUG ===')
    console.log('Database Config:', JSON.stringify(config, null, 2))
    console.log('Table Config:', JSON.stringify(tableConfig, null, 2))
    console.log('Table Name:', tableConfig.tableName)
    console.log('Columns:', tableConfig.columns)

    await DatabaseManager.createTable(config, tableConfig)
    
    console.log(`✅ Table "${tableConfig.tableName}" created successfully`)
    
    return NextResponse.json({ 
      success: true, 
      message: `Table "${tableConfig.tableName}" created successfully` 
    })
  } catch (error) {
    console.error('❌ CREATE TABLE ERROR:', error)
    console.error('Error message:', error instanceof Error ? error.message : 'Unknown error')
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to create table',
        debug: {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : 'No stack trace'
        }
      },
      { status: 500 }
    )
  }
}
