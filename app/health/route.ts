import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const uptime = process.uptime()
    const memoryUsage = process.memoryUsage()
    
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.floor(uptime),
        human: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`
      },
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024), // MB
        percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        environment: process.env.NODE_ENV || 'development'
      },
      api: {
        version: '1.0.0',
        totalEndpoints: 30, // Updated count
        directEndpoints: [
          '/upload',
          '/previewData', 
          '/testConnection',
          '/createTable',
          '/insertData',
          '/validateData',
          '/generateSchema',
          '/getTables',
          '/analyzeSheets',
          '/health'
        ],
        apiEndpoints: [
          '/api/excel/*',
          '/api/database/*', 
          '/api/sheets/*',
          '/api/tables/*',
          '/api/data/*',
          '/api/sql/*',
          '/api/validation/*',
          '/api/files/*',
          '/api/schema/*',
          '/api/system/*'
        ]
      },
      endpoint: '/health'
    }
    
    return NextResponse.json(healthStatus)
    
  } catch (error) {
    console.error('❌ [/health] Error:', error)
    return NextResponse.json(
      { 
        status: 'error',
        message: 'Health check failed',
        timestamp: new Date().toISOString(),
        endpoint: '/health'
      },
      { status: 500 }
    )
  }
}
