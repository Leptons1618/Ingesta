import { NextRequest, NextResponse } from 'next/server'
import { DatabaseManager, type DatabaseConfig } from '@/lib/database-manager'

export async function POST(request: NextRequest) {
  try {
    const { config, tableName, limit = 10 }: { 
      config: DatabaseConfig
      tableName: string
      limit?: number
    } = await request.json()

    console.log(`=== TABLE PREVIEW DEBUG ===`)
    console.log('Table:', tableName)
    console.log('Limit:', limit)

    const result = await DatabaseManager.previewTable(config, tableName, limit)
    
    console.log(`✅ Fetched ${result.data.length} rows for preview`)
    
    return NextResponse.json({ 
      success: true, 
      columns: result.columns,
      data: result.data,
      totalRows: result.data.length
    })
  } catch (error) {
    console.error('❌ TABLE PREVIEW ERROR:', error)
    
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to preview table' 
      },
      { status: 500 }
    )
  }
}
