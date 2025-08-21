import { NextRequest, NextResponse } from 'next/server'
import { DatabaseManager, type DatabaseConfig } from '@/lib/database-manager'
import { DataTypeDetector, type TableCreationConfig } from '@/lib/data-type-detector'

export async function POST(request: NextRequest) {
  try {
    const { 
      databaseConfig, 
      sheetsData 
    }: { 
      databaseConfig: DatabaseConfig,
      sheetsData: Array<{
        fileName: string
        sheetName: string
        headers: string[]
        data: any[][]
      }>
    } = await request.json()
    
    console.log('🏗️ [API/tables/configure] Starting table configuration')
    console.log(`Configuring ${sheetsData.length} tables`)
    
    const tableConfigurations = sheetsData.map(sheet => {
      const sanitizedTableName = DataTypeDetector.sanitizeTableName(sheet.sheetName)
      
      // Analyze each column
      const columnAnalyses = sheet.headers.map((header, index) => {
        const columnData = sheet.data.slice(1).map(row => row[index])
        return DataTypeDetector.analyzeColumn(header, columnData)
      })
      
      const tableConfig: TableCreationConfig = {
        tableName: sanitizedTableName,
        columns: columnAnalyses,
        primaryKey: 'id', // Default primary key
        indexes: []
      }
      
      return {
        originalSheetName: sheet.sheetName,
        fileName: sheet.fileName,
        config: tableConfig,
        dataPreview: {
          headers: sheet.headers,
          sampleRows: sheet.data.slice(1, 6), // First 5 data rows
          totalRows: sheet.data.length - 1
        }
      }
    })
    
    console.log('✅ [API/tables/configure] Table configurations generated')
    
    return NextResponse.json({
      success: true,
      configurations: tableConfigurations,
      summary: {
        totalTables: tableConfigurations.length,
        totalColumns: tableConfigurations.reduce((sum, config) => sum + config.config.columns.length, 0)
      },
      message: 'Table configurations generated successfully'
    })
    
  } catch (error) {
    console.error('❌ [API/tables/configure] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to configure tables' 
      },
      { status: 500 }
    )
  }
}
