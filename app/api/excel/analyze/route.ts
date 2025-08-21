import { NextRequest, NextResponse } from 'next/server'
import { ExcelParser, type ParsedData } from '@/lib/excel-parser'

export async function POST(request: NextRequest) {
  try {
    const { parsedData }: { parsedData: ParsedData } = await request.json()
    
    console.log('🔍 [API/excel/analyze] Starting data analysis')
    console.log(`Files: ${parsedData.files.length}, Total sheets: ${parsedData.totalSheets}`)
    
    // Analyze each file and sheet for data quality and structure
    const analysis = {
      files: parsedData.files.map(file => ({
        name: file.name,
        size: file.size,
        sheets: file.sheets.map(sheet => ({
          name: sheet.name,
          rowCount: sheet.rowCount,
          columnCount: sheet.columnCount,
          headers: sheet.headers,
          hasData: sheet.data.length > 1, // More than just headers
          dataQuality: {
            emptyRows: sheet.data.filter(row => row.every(cell => !cell || cell === '')).length,
            missingHeaders: sheet.headers.filter(h => !h || h === '').length,
            duplicateHeaders: sheet.headers.length - new Set(sheet.headers).size,
          },
          sampleData: sheet.data.slice(0, 5) // First 5 rows for preview
        }))
      })),
      summary: {
        totalFiles: parsedData.files.length,
        totalSheets: parsedData.totalSheets,
        totalRows: parsedData.totalRows,
        validSheets: parsedData.files.reduce((acc, file) => 
          acc + file.sheets.filter(sheet => sheet.data.length > 1).length, 0
        )
      }
    }
    
    console.log(`✅ [API/excel/analyze] Analysis complete: ${analysis.summary.validSheets} valid sheets`)
    
    return NextResponse.json({
      success: true,
      analysis,
      message: 'Data analysis completed successfully'
    })
    
  } catch (error) {
    console.error('❌ [API/excel/analyze] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to analyze data' 
      },
      { status: 500 }
    )
  }
}
