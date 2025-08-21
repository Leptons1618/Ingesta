import { NextRequest, NextResponse } from 'next/server'
import { DataCleaner } from '@/lib/data-cleaner'

interface ValidationIssue {
  row: number
  column: string
  issue: string
  value: any
}

interface ValidationWarning {
  row: number
  column: string
  message: string
  originalValue: any
  cleanedValue: any
}

export async function POST(request: NextRequest) {
  try {
    console.log('✅ [/validateData] Starting data validation')
    
    const { 
      data, 
      headers, 
      validationRules = {},
      cleaningOptions = { handleNulls: 'default', trimStrings: true, convertTypes: true }
    } = await request.json()
    
    if (!data || !Array.isArray(data)) {
      return NextResponse.json(
        { success: false, message: 'Data array is required' },
        { status: 400 }
      )
    }
    
    if (!headers || !Array.isArray(headers)) {
      return NextResponse.json(
        { success: false, message: 'Headers array is required' },
        { status: 400 }
      )
    }
    
    console.log(`✅ [/validateData] Validating ${data.length} rows with ${headers.length} columns`)
    
    // Validate data using custom rules
    const validationResults = {
      totalRows: data.length,
      validRows: 0,
      invalidRows: 0,
      issues: [] as ValidationIssue[],
      cleanedData: [] as any[][],
      warnings: [] as ValidationWarning[]
    }
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      const rowIssues: ValidationIssue[] = []
      
      // Check for missing required fields
      headers.forEach((header, index) => {
        const value = row[index]
        
        if (validationRules[header]?.required && (!value || value === '')) {
          rowIssues.push({
            row: i + 1,
            column: header,
            issue: 'Required field is empty',
            value: value
          })
        }
        
        // Check data type constraints
        if (value && validationRules[header]?.type) {
          const expectedType = validationRules[header].type
          
          if (expectedType === 'number' && isNaN(Number(value))) {
            rowIssues.push({
              row: i + 1,
              column: header,
              issue: 'Expected number but got text',
              value: value
            })
          }
          
          if (expectedType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            rowIssues.push({
              row: i + 1,
              column: header,
              issue: 'Invalid email format',
              value: value
            })
          }
        }
      })
      
      if (rowIssues.length > 0) {
        validationResults.invalidRows++
        validationResults.issues.push(...rowIssues)
      } else {
        validationResults.validRows++
      }
    }
    
    // Clean the data using DataCleaner utility
    const cleanedResult = DataCleaner.cleanData(
      data, 
      headers, 
      cleaningOptions
    )
    
    validationResults.cleanedData = cleanedResult.cleanedData
    validationResults.warnings = cleanedResult.warnings.map((w: string, index: number) => ({
      row: cleanedResult.skippedRows.includes(index) ? index + 1 : 0,
      column: 'various',
      message: w,
      originalValue: '',
      cleanedValue: ''
    }))
    
    return NextResponse.json({
      success: true,
      validation: validationResults,
      cleaning: {
        originalRows: data.length,
        cleanedRows: cleanedResult.cleanedData.length,
        skippedRows: cleanedResult.skippedRows.length,
        warnings: cleanedResult.warnings.length
      },
      message: `Validated ${data.length} rows. ${validationResults.validRows} valid, ${validationResults.invalidRows} with issues.`,
      endpoint: '/validateData'
    })
    
  } catch (error) {
    console.error('❌ [/validateData] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to validate data',
        endpoint: '/validateData'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/validateData',
    method: 'POST',
    description: 'Validate and clean data before database insertion',
    parameters: {
      data: 'array of arrays - data rows to validate',
      headers: 'array of strings - column headers',
      validationRules: 'object - optional validation rules per column',
      cleaningOptions: 'object - optional data cleaning configuration'
    },
    usage: 'POST /validateData with JSON body',
    example: {
      data: [
        [1, 'john@example.com', 'John'],
        [2, 'invalid-email', 'Jane'],
        [null, 'bob@test.com', '']
      ],
      headers: ['id', 'email', 'name'],
      validationRules: {
        id: { required: true, type: 'number' },
        email: { required: true, type: 'email' },
        name: { required: true }
      },
      cleaningOptions: {
        handleNulls: 'default',
        trimStrings: true,
        convertTypes: true
      }
    }
  })
}
