import { NextRequest, NextResponse } from 'next/server'
import { DataTypeDetector } from '@/lib/data-type-detector'

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 [/analyzeSheets] Starting sheet analysis')
    
    const { 
      parsedData,
      databaseConfig,
      options = {}
    } = await request.json()
    
    if (!parsedData) {
      return NextResponse.json(
        { success: false, message: 'Parsed data is required' },
        { status: 400 }
      )
    }
    
    if (!parsedData.files || !Array.isArray(parsedData.files)) {
      return NextResponse.json(
        { success: false, message: 'Parsed data must contain files array' },
        { status: 400 }
      )
    }
    
    console.log(`🔍 [/analyzeSheets] Analyzing ${parsedData.files.length} files`)
    
    const sheetAnalysis = []
    let totalSheets = 0
    
    for (const file of parsedData.files) {
      if (!file.sheets || !Array.isArray(file.sheets)) continue
      
      for (const sheet of file.sheets) {
        totalSheets++
        
        const analysis = {
          fileName: file.fileName,
          sheetName: sheet.name,
          rowCount: sheet.data.length,
          columnCount: sheet.headers.length,
          headers: sheet.headers,
          sampleData: sheet.data.slice(0, 3), // First 3 rows as sample
          columnAnalysis: sheet.headers.map((header: any, index: any) => {
            const columnData = sheet.data.map((row: any) => row[index])
            return DataTypeDetector.analyzeColumn(header, columnData)
          }),
          suggestedTableName: DataTypeDetector.sanitizeTableName(sheet.name),
          isEmpty: sheet.data.length === 0,
          hasHeaders: sheet.headers.length > 0,
          dataQuality: {
            emptyRows: sheet.data.filter((row: any) => row.every((cell: any) => !cell || cell === '')).length,
            nullCount: sheet.data.flat().filter((cell: any) => cell === null || cell === undefined).length,
            totalCells: sheet.data.length * sheet.headers.length
          }
        }
        
        sheetAnalysis.push(analysis)
      }
    }
    
    // Generate recommendations
    const recommendations = sheetAnalysis.map(sheet => {
      const recommendation = {
        fileName: sheet.fileName,
        sheetName: sheet.sheetName,
        action: 'create', // Default action
        confidence: 'high',
        issues: [] as string[],
        suggestions: [] as string[]
      }
      
      // Check for issues
      if (sheet.isEmpty) {
        recommendation.action = 'skip'
        recommendation.confidence = 'high'
        recommendation.issues.push('Sheet is empty')
      } else if (!sheet.hasHeaders) {
        recommendation.confidence = 'low'
        recommendation.issues.push('No headers detected')
      } else if (sheet.dataQuality.emptyRows > sheet.rowCount * 0.5) {
        recommendation.confidence = 'medium'
        recommendation.issues.push('More than 50% empty rows')
      }
      
      // Add suggestions
      if (sheet.columnAnalysis.some((col: any) => col.uniqueValues === col.totalCount)) {
        recommendation.suggestions.push('Consider adding primary key index')
      }
      
      if (sheet.dataQuality.nullCount > 0) {
        recommendation.suggestions.push('Review null value handling strategy')
      }
      
      return recommendation
    })
    
    const summary = {
      totalFiles: parsedData.files.length,
      totalSheets,
      sheetsToCreate: recommendations.filter(r => r.action === 'create').length,
      sheetsToSkip: recommendations.filter(r => r.action === 'skip').length,
      averageRowsPerSheet: Math.round(sheetAnalysis.reduce((sum, s) => sum + s.rowCount, 0) / totalSheets),
      averageColumnsPerSheet: Math.round(sheetAnalysis.reduce((sum, s) => sum + s.columnCount, 0) / totalSheets)
    }
    
    return NextResponse.json({
      success: true,
      analysis: {
        sheets: sheetAnalysis,
        recommendations,
        summary
      },
      message: `Analyzed ${totalSheets} sheets from ${parsedData.files.length} files`,
      endpoint: '/analyzeSheets'
    })
    
  } catch (error) {
    console.error('❌ [/analyzeSheets] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to analyze sheets',
        endpoint: '/analyzeSheets'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/analyzeSheets',
    method: 'POST',
    description: 'Analyze Excel sheets for database mapping and quality assessment',
    parameters: {
      parsedData: 'ParsedData object from /upload endpoint',
      databaseConfig: 'DatabaseConfig object (optional)',
      options: 'object - optional analysis configuration'
    },
    usage: 'POST /analyzeSheets with JSON body',
    example: {
      parsedData: {
        files: [
          {
            fileName: 'data.xlsx',
            sheets: [
              {
                name: 'Sheet1',
                headers: ['id', 'name', 'email'],
                data: [[1, 'John', 'john@test.com']]
              }
            ]
          }
        ]
      },
      databaseConfig: { type: 'postgresql', host: 'localhost' },
      options: { includeDataQuality: true }
    }
  })
}
