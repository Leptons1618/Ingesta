import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const uptime = process.uptime()
    const memoryUsage = process.memoryUsage()
    
    const status = {
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
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      },
      api: {
        version: '1.0.0',
        endpoints: {
          excel: ['/api/excel/upload', '/api/excel/analyze'],
          database: [
            '/api/database/test-connection',
            '/api/database/connections', 
            '/api/database/get-tables',
            '/api/database/preview-table',
            '/api/database/create-table',
            '/api/database/insert-data'
          ],
          sheets: ['/api/sheets/analyze', '/api/sheets/select'],
          tables: ['/api/tables/create', '/api/tables/configure'],
          data: ['/api/data/insert', '/api/data/insert-clean', '/api/data/import'],
          sql: ['/api/sql/generate', '/api/sql/execute'],
          validation: ['/api/validation/data'],
          files: ['/api/files/history'],
          system: ['/api/system/health']
        }
      }
    }
    
    return NextResponse.json(status)
    
  } catch (error) {
    console.error('❌ [API/system/health] Error:', error)
    return NextResponse.json(
      { 
        status: 'error',
        message: 'Health check failed',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
