import { NextRequest, NextResponse } from 'next/server'
import { ExcelParser } from '@/lib/excel-parser'

export async function POST(request: NextRequest) {
  try {
    console.log('📤 [/upload] Starting file upload processing')
    
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    
    if (!files.length) {
      console.log('❌ [/upload] No files provided')
      return NextResponse.json(
        { success: false, message: 'No files provided' },
        { status: 400 }
      )
    }
    
    console.log(`📤 [/upload] Processing ${files.length} file(s)`)
    
    const parsedData = await ExcelParser.parseFiles(files)
    console.log(`✅ [/upload] Successfully parsed ${parsedData.files.length} files`)
    
    return NextResponse.json({
      success: true,
      data: parsedData,
      message: `Successfully processed ${files.length} file(s)`,
      endpoint: '/upload'
    })
    
  } catch (error) {
    console.error('❌ [/upload] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to process files',
        endpoint: '/upload'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/upload',
    method: 'POST',
    description: 'Upload and parse Excel files',
    usage: 'POST /upload with FormData containing files',
    example: 'curl -X POST http://localhost:3000/upload -F "files=@data.xlsx"'
  })
}
