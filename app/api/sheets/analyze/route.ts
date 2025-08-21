import { NextRequest, NextResponse } from 'next/server'
import { DatabaseManager, type DatabaseConfig } from '@/lib/database-manager'
import { DataTypeDetector } from '@/lib/data-type-detector'

export async function POST(request: NextRequest) {
  try {
    const { 
      parsedData, 
      databaseConfig 
    }: { 
      parsedData: any, 
      databaseConfig: DatabaseConfig 
    } = await request.json()
    
    console.log('📊 [API/sheets/analyze] Starting sheet analysis for table mapping')
    
    // Get existing database tables
    const existingTables = await DatabaseManager.getTables(databaseConfig)
    console.log(`📊 [API/sheets/analyze] Found ${existingTables.length} existing database tables`)
    
    // Analyze each sheet for mapping possibilities
    const sheetAnalysis = parsedData.files.flatMap((file: any) =>
      file.sheets.map((sheet: any) => {
        const sanitizedTableName = DataTypeDetector.sanitizeTableName(sheet.name)
        
        // Check if table already exists
        const existingTable = existingTables.find(table => 
          table.name.toLowerCase() === sanitizedTableName.toLowerCase()
        )
        
        // Analyze data types
        const columnAnalysis = sheet.headers.map((header: string, index: number) => {
          const columnData = sheet.data.slice(1).map((row: any[]) => row[index])
          const analysis = DataTypeDetector.analyzeColumn(header, columnData)
          
          return {
            name: header,
            originalIndex: index,
            detectedType: analysis.suggestedType,
            nullable: analysis.nullable,
            maxLength: analysis.maxLength,
            hasNullValues: analysis.nullCount > 0,
            uniqueValues: analysis.uniqueValues,
            sampleValues: analysis.samples
          }
        })
        
        return {
          fileName: file.name,
          sheetName: sheet.name,
          sanitizedTableName,
          rowCount: sheet.rowCount,
          columnCount: sheet.columnCount,
          hasData: sheet.data.length > 1,
          canCreateTable: !existingTable,
          canMapToExisting: !!existingTable,
          existingTable: existingTable || null,
          columns: columnAnalysis,
          recommendedAction: existingTable ? 'map' : 'create',
          data: sheet.data // Include raw data for table creation
        }
      })
    )
    
    const summary = {
      totalSheets: sheetAnalysis.length,
      sheetsToCreate: sheetAnalysis.filter((s: any) => s.recommendedAction === 'create').length,
      sheetsToMap: sheetAnalysis.filter((s: any) => s.recommendedAction === 'map').length,
      existingTables: existingTables.length
    }
    
    console.log(`✅ [API/sheets/analyze] Analysis complete:`, summary)
    
    return NextResponse.json({
      success: true,
      sheetAnalysis,
      existingTables,
      summary,
      message: 'Sheet analysis completed successfully'
    })
    
  } catch (error) {
    console.error('❌ [API/sheets/analyze] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to analyze sheets' 
      },
      { status: 500 }
    )
  }
}
