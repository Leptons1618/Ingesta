import { NextRequest, NextResponse } from 'next/server'
import { ConnectionStorage } from '@/lib/connection-storage'
import { type DatabaseConfig } from '@/lib/database-manager'

export async function GET(request: NextRequest) {
  try {
    console.log('📋 [API/database/connections/list] Fetching saved connections')
    
    const connections = ConnectionStorage.getAllConnections()
    console.log(`✅ [API/database/connections/list] Found ${connections.length} saved connections`)
    
    // Remove sensitive data from response
    const safeConnections = connections.map((conn: DatabaseConfig) => ({
      id: conn.id,
      name: conn.name,
      type: conn.type,
      host: conn.host,
      port: conn.port,
      database: conn.database,
      username: conn.username,
      ssl: conn.ssl,
      // Don't include password in response
    }))
    
    return NextResponse.json({
      success: true,
      connections: safeConnections,
      count: connections.length
    })
    
  } catch (error) {
    console.error('❌ [API/database/connections/list] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to fetch connections' 
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { connection }: { connection: DatabaseConfig } = await request.json()
    
    console.log('💾 [API/database/connections/save] Saving new connection:', connection.name)
    
    ConnectionStorage.saveConnection(connection)
    console.log(`✅ [API/database/connections/save] Connection saved: ${connection.name}`)
    
    // Remove password from response
    const { password, ...safeConnection } = connection
    
    return NextResponse.json({
      success: true,
      connection: safeConnection,
      message: 'Connection saved successfully'
    })
    
  } catch (error) {
    console.error('❌ [API/database/connections/save] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to save connection' 
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const connectionId = searchParams.get('id')
    
    if (!connectionId) {
      return NextResponse.json(
        { success: false, message: 'Connection ID is required' },
        { status: 400 }
      )
    }
    
    console.log(`🗑️ [API/database/connections/delete] Deleting connection: ${connectionId}`)
    
    ConnectionStorage.removeConnection(connectionId)
    console.log(`✅ [API/database/connections/delete] Connection deleted: ${connectionId}`)
    
    return NextResponse.json({
      success: true,
      message: 'Connection deleted successfully'
    })
    
  } catch (error) {
    console.error('❌ [API/database/connections/delete] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to delete connection' 
      },
      { status: 500 }
    )
  }
}
