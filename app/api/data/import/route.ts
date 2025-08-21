import { NextRequest, NextResponse } from 'next/server'
import { DatabaseManager, type DatabaseConfig } from '@/lib/database-manager'
import { DataTransformer } from '@/lib/data-transformer'
import { DataMapper, type SheetMapping } from '@/lib/data-mapper'

export async function POST(request: NextRequest) {
  try {
    const { 
      databaseConfig, 
      mappings,
      sheetData
    }: { 
      databaseConfig: DatabaseConfig
      mappings: SheetMapping[]
      sheetData: Array<{
        fileName: string
        sheetName: string
        headers: string[]
        data: any[][]
        targetTable: string
      }>
    } = await request.json()
    
    console.log('📥 [API/data/import] Starting data import process')
    console.log(`Processing ${mappings.length} sheet mappings`)
    
    const results = []
    
    for (const mapping of mappings) {
      const sheet = sheetData.find(s => 
        s.sheetName === mapping.sheetName
      )
      
      if (!sheet) {
        console.log(`⚠️ [API/data/import] Sheet not found for mapping: ${mapping.sheetName}`)
        continue
      }
      
      console.log(`📊 [API/data/import] Processing ${sheet.targetTable}`)
      
      // Transform data according to mapping (simplified for now)
      const dataToInsert = sheet.data.slice(1) // Skip headers
      
      // Insert data
      const insertResult = await DatabaseManager.insertData(
        databaseConfig,
        sheet.targetTable,
        dataToInsert,
        sheet.headers
      )
      
      results.push({
        fileName: sheet.fileName,
        sheetName: sheet.sheetName,
        targetTable: sheet.targetTable,
        insertedRows: insertResult.insertedRows,
        success: true
      })
      
      console.log(`✅ [API/data/import] Imported ${insertResult.insertedRows} rows to ${sheet.targetTable}`)
    }
    
    const summary = {
      totalMappings: mappings.length,
      successfulImports: results.filter(r => r.success).length,
      totalRowsInserted: results.reduce((sum, r) => sum + r.insertedRows, 0)
    }
    
    console.log(`✅ [API/data/import] Import complete:`, summary)
    
    return NextResponse.json({
      success: true,
      results,
      summary,
      message: `Successfully imported data from ${summary.successfulImports} sheets`
    })
    
  } catch (error) {
    console.error('❌ [API/data/import] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to import data' 
      },
      { status: 500 }
    )
  }
}
