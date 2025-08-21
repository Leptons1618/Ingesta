import { NextRequest, NextResponse } from 'next/server'
import { DatabaseManager, type DatabaseConfig } from '@/lib/database-manager'

export async function POST(request: NextRequest) {
  try {
    const config: DatabaseConfig = await request.json()
    const tables = await DatabaseManager.getTables(config)
    
    if (tables.length === 0) {
      return NextResponse.json({ 
        tables: [], 
        message: 'No tables found in the database' 
      })
    }
    
    return NextResponse.json({ tables })
  } catch (error) {
    return NextResponse.json(
      { 
        tables: [], 
        message: error instanceof Error ? error.message : 'Failed to fetch tables',
        error: true
      },
      { status: 500 }
    )
  }
}
