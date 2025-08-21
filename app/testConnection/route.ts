import { NextRequest, NextResponse } from 'next/server'
import { DatabaseManager, type DatabaseConfig } from '@/lib/database-manager'

export async function POST(request: NextRequest) {
  try {
    console.log('🔌 [/testConnection] Testing database connection')
    
    const config: DatabaseConfig = await request.json()
    
    if (!config.type || !config.host || !config.database) {
      return NextResponse.json(
        { success: false, message: 'Database type, host, and database name are required' },
        { status: 400 }
      )
    }
    
    console.log(`🔌 [/testConnection] Testing ${config.type} connection to ${config.host}`)
    
    const result = await DatabaseManager.testConnection(config)
    
    return NextResponse.json({
      ...result,
      endpoint: '/testConnection',
      config: {
        type: config.type,
        host: config.host,
        database: config.database,
        port: config.port
      }
    })
    
  } catch (error) {
    console.error('❌ [/testConnection] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to test connection',
        endpoint: '/testConnection'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/testConnection',
    method: 'POST',
    description: 'Test database connection',
    parameters: {
      type: 'string - postgresql | mysql | sqlite | mssql',
      host: 'string - database host',
      port: 'number - database port',
      database: 'string - database name',
      username: 'string - database username',
      password: 'string - database password'
    },
    usage: 'POST /testConnection with JSON body',
    example: {
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'mydb',
      username: 'user',
      password: 'password'
    }
  })
}
