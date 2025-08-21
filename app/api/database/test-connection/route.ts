import { NextRequest, NextResponse } from 'next/server'
import { DatabaseManager, type DatabaseConfig } from '@/lib/database-manager'

export async function POST(request: NextRequest) {
  try {
    const config: DatabaseConfig = await request.json()
    const result = await DatabaseManager.testConnection(config)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to test connection' 
      },
      { status: 500 }
    )
  }
}
