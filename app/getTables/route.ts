import { NextRequest, NextResponse } from 'next/server'
import { DatabaseManager, type DatabaseConfig } from '@/lib/database-manager'

export async function POST(request: NextRequest) {
  try {
    console.log('📋 [/getTables] Getting database tables')
    
    const { config }: { config: DatabaseConfig } = await request.json()
    
    if (!config) {
      return NextResponse.json(
        { success: false, message: 'Database config is required' },
        { status: 400 }
      )
    }
    
    console.log(`📋 [/getTables] Getting tables from ${config.type} database: ${config.database}`)
    
    const tables = await DatabaseManager.getTables(config)
    
    return NextResponse.json({
      success: true,
      tables,
      count: tables.length,
      database: {
        type: config.type,
        host: config.host,
        database: config.database,
        port: config.port
      },
      message: `Found ${tables.length} tables in database`,
      endpoint: '/getTables'
    })
    
  } catch (error) {
    console.error('❌ [/getTables] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to get database tables',
        endpoint: '/getTables'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/getTables',
    method: 'POST',
    description: 'Get list of tables from database',
    parameters: {
      config: 'DatabaseConfig object with connection details'
    },
    usage: 'POST /getTables with JSON body',
    example: {
      config: {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        database: 'mydb',
        username: 'user',
        password: 'password'
      }
    }
  })
}
