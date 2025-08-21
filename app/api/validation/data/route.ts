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
    const { 
      data, 
      headers, 
      validationRules = {} 
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
    
    // Validate data using DataCleaner
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
          const actualType = typeof value
          
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
      
      // Clean the data using DataCleaner utility
      const cleanedRow = DataCleaner.cleanData(
        [row], 
        headers, 
        {
          handleNulls: 'default',
          trimStrings: true,
          convertTypes: true
        }
      )
      
      validationResults.cleanedData.push(cleanedRow.cleanedData[0] || row)
      if (cleanedRow.warnings.length > 0) {
        validationResults.warnings.push(...cleanedRow.warnings.map((w: string) => ({
          row: i + 1,
          column: 'unknown',
          message: w,
          originalValue: '',
          cleanedValue: ''
        })))
      }
    }
    
    return NextResponse.json({
      success: true,
      validation: validationResults,
      message: `Validated ${data.length} rows. ${validationResults.validRows} valid, ${validationResults.invalidRows} with issues.`
    })
    
  } catch (error) {
    console.error('❌ [API/validation/data] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to validate data' 
      },
      { status: 500 }
    )
  }
}
