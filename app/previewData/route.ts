import { NextRequest, NextResponse } from 'next/server'
import { DatabaseManager, type DatabaseConfig } from '@/lib/database-manager'

export async function POST(request: NextRequest) {
  try {
    console.log('👁️ [/previewData] Starting table preview')
    
    const { config, tableName, limit = 100 } = await request.json()
    
    if (!config) {
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
    
    console.log(`👁️ [/previewData] Previewing table: ${tableName}`)
    
    const result = await DatabaseManager.previewTable(config, tableName, limit)
    
    return NextResponse.json({
      success: true,
      tableName,
      columns: result.columns,
      data: result.data,
      totalRows: result.data.length,
      limit,
      endpoint: '/previewData'
    })
    
  } catch (error) {
    console.error('❌ [/previewData] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to preview table data',
        endpoint: '/previewData'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/previewData',
    method: 'POST',
    description: 'Preview table data from database',
    parameters: {
      config: 'DatabaseConfig object',
      tableName: 'string - name of table to preview',
      limit: 'number - optional, default 100'
    },
    usage: 'POST /previewData with JSON body',
    example: {
      config: { type: 'postgresql', host: 'localhost', database: 'mydb', username: 'user', password: 'pass' },
      tableName: 'my_table',
      limit: 50
    }
  })
}
