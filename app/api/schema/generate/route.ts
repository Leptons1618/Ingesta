import { NextRequest, NextResponse } from 'next/server'
import { DataTypeDetector } from '@/lib/data-type-detector'

export async function POST(request: NextRequest) {
  try {
    const { 
      data, 
      headers, 
      tableName,
      databaseType = 'postgresql'
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
    
    if (!tableName) {
      return NextResponse.json(
        { success: false, message: 'Table name is required' },
        { status: 400 }
      )
    }
    
    // Analyze data types
    const columnTypes = headers.map((header, index) => {
      const columnData = data.map(row => row[index])
      return DataTypeDetector.analyzeColumn(header, columnData)
    })
    
    // Generate schema based on database type
    const schema = generateSchema(tableName, headers, columnTypes, databaseType)
    
    return NextResponse.json({
      success: true,
      schema: {
        tableName,
        databaseType,
        columns: columnTypes,
        createStatement: schema.create,
        insertStatement: schema.insert,
        dropStatement: schema.drop
      },
      message: `Schema generated for table '${tableName}'`
    })
    
  } catch (error) {
    console.error('❌ [API/schema/generate] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to generate schema' 
      },
      { status: 500 }
    )
  }
}

function generateSchema(
  tableName: string, 
  headers: string[], 
  columnTypes: any[], 
  databaseType: string
) {
  const sanitizedTableName = DataTypeDetector.sanitizeTableName(tableName)
  
  // Generate column definitions
  const columnDefs = headers.map((header, index) => {
    const sanitizedColumn = DataTypeDetector.sanitizeColumnName(header)
    const analysis = columnTypes[index]
    
    let sqlType = 'TEXT' // Default fallback
    
    switch (databaseType.toLowerCase()) {
      case 'postgresql':
        sqlType = mapToPostgreSQLType(analysis)
        break
      case 'mysql':
        sqlType = mapToMySQLType(analysis)
        break
      case 'sqlite':
        sqlType = mapToSQLiteType(analysis)
        break
      case 'mssql':
        sqlType = mapToMSSQLType(analysis)
        break
    }
    
    return `  "${sanitizedColumn}" ${sqlType}`
  }).join(',\n')
  
  // Generate statements
  const createStatement = `CREATE TABLE IF NOT EXISTS "${sanitizedTableName}" (\n${columnDefs}\n);`
  
  const insertPlaceholders = headers.map(() => '?').join(', ')
  const insertStatement = `INSERT INTO "${sanitizedTableName}" (${headers.map(h => `"${DataTypeDetector.sanitizeColumnName(h)}"`).join(', ')}) VALUES (${insertPlaceholders});`
  
  const dropStatement = `DROP TABLE IF EXISTS "${sanitizedTableName}";`
  
  return {
    create: createStatement,
    insert: insertStatement,
    drop: dropStatement
  }
}

function mapToPostgreSQLType(analysis: any): string {
  const suggestedType = analysis.suggestedType.toLowerCase()
  
  if (suggestedType.includes('int')) return 'INTEGER'
  if (suggestedType.includes('decimal') || suggestedType.includes('numeric')) return 'DECIMAL'
  if (suggestedType.includes('bool')) return 'BOOLEAN'
  if (suggestedType.includes('timestamp') || suggestedType.includes('date')) return 'TIMESTAMP'
  
  return `VARCHAR(${Math.max(analysis.maxLength || 255, 255)})`
}

function mapToMySQLType(analysis: any): string {
  const suggestedType = analysis.suggestedType.toLowerCase()
  
  if (suggestedType.includes('int')) return 'INT'
  if (suggestedType.includes('decimal') || suggestedType.includes('numeric')) return 'DECIMAL(10,2)'
  if (suggestedType.includes('bool')) return 'BOOLEAN'
  if (suggestedType.includes('timestamp') || suggestedType.includes('date')) return 'DATETIME'
  
  return `VARCHAR(${Math.max(analysis.maxLength || 255, 255)})`
}

function mapToSQLiteType(analysis: any): string {
  const suggestedType = analysis.suggestedType.toLowerCase()
  
  if (suggestedType.includes('int')) return 'INTEGER'
  if (suggestedType.includes('decimal') || suggestedType.includes('numeric')) return 'REAL'
  if (suggestedType.includes('bool')) return 'INTEGER'
  
  return 'TEXT'
}

function mapToMSSQLType(analysis: any): string {
  const suggestedType = analysis.suggestedType.toLowerCase()
  
  if (suggestedType.includes('int')) return 'INT'
  if (suggestedType.includes('decimal') || suggestedType.includes('numeric')) return 'DECIMAL(10,2)'
  if (suggestedType.includes('bool')) return 'BIT'
  if (suggestedType.includes('timestamp') || suggestedType.includes('date')) return 'DATETIME2'
  
  return `NVARCHAR(${Math.max(analysis.maxLength || 255, 255)})`
}
