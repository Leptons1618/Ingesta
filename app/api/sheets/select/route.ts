import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { 
      selectedSheets 
    }: { 
      selectedSheets: Array<{
        fileName: string
        sheetName: string
        action: 'create' | 'map'
        targetTable?: string
      }>
    } = await request.json()
    
    console.log('✅ [API/sheets/select] Processing sheet selections')
    console.log(`Selected ${selectedSheets.length} sheets for processing`)
    
    // Categorize sheets by action
    const sheetsForCreation = selectedSheets.filter(sheet => sheet.action === 'create')
    const sheetsForMapping = selectedSheets.filter(sheet => sheet.action === 'map')
    
    const analysis = {
      totalSelected: selectedSheets.length,
      forCreation: {
        count: sheetsForCreation.length,
        sheets: sheetsForCreation.map(sheet => ({
          fileName: sheet.fileName,
          sheetName: sheet.sheetName,
          action: sheet.action
        }))
      },
      forMapping: {
        count: sheetsForMapping.length,
        sheets: sheetsForMapping.map(sheet => ({
          fileName: sheet.fileName,
          sheetName: sheet.sheetName,
          action: sheet.action,
          targetTable: sheet.targetTable
        }))
      },
      nextSteps: {
        hasTablestoCreate: sheetsForCreation.length > 0,
        hasDataToMap: sheetsForMapping.length > 0,
        recommendedNextStep: sheetsForCreation.length > 0 ? 'table-creation' : 'data-mapping'
      }
    }
    
    console.log('📊 [API/sheets/select] Selection analysis:', analysis)
    
    return NextResponse.json({
      success: true,
      analysis,
      message: `Successfully processed ${selectedSheets.length} sheet selections`
    })
    
  } catch (error) {
    console.error('❌ [API/sheets/select] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to process sheet selections' 
      },
      { status: 500 }
    )
  }
}
