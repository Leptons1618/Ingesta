import { NextRequest, NextResponse } from 'next/server'
import { ExcelParser } from '@/lib/excel-parser'

export async function POST(request: NextRequest) {
  try {
    console.log('📤 [API/excel/upload] Starting file upload processing')
    
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    
    if (!files.length) {
      console.log('❌ [API/excel/upload] No files provided')
      return NextResponse.json(
        { success: false, message: 'No files provided' },
        { status: 400 }
      )
    }
    
    console.log(`📤 [API/excel/upload] Processing ${files.length} file(s)`)
    
    const parsedData = await ExcelParser.parseFiles(files)
    console.log(`✅ [API/excel/upload] Successfully parsed ${parsedData.files.length} files`)
    
    return NextResponse.json({
      success: true,
      data: parsedData,
      message: `Successfully processed ${files.length} file(s)`
    })
    
  } catch (error) {
    console.error('❌ [API/excel/upload] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to process files' 
      },
      { status: 500 }
    )
  }
}
