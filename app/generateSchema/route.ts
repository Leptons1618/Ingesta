import { NextRequest, NextResponse } from 'next/server'
import { DataTypeDetector } from '@/lib/data-type-detector'

export async function POST(request: NextRequest) {
  try {
    console.log('📋 [/generateSchema] Starting schema generation')
    
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
    
    console.log(`📋 [/generateSchema] Generating ${databaseType} schema for table: ${tableName}`)
    
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
        tableName: schema.tableName,
        databaseType,
        columns: columnTypes,
        createStatement: schema.create,
        insertStatement: schema.insert,
        dropStatement: schema.drop
      },
      analysis: {
        totalColumns: headers.length,
        sampleRows: Math.min(data.length, 5),
        recommendedTypes: columnTypes.map(col => ({
          column: col.name,
          type: col.suggestedType,
          nullable: col.nullable,
          uniqueValues: col.uniqueValues
        }))
      },
      message: `Schema generated for table '${tableName}' with ${headers.length} columns`,
      endpoint: '/generateSchema'
    })
    
  } catch (error) {
    console.error('❌ [/generateSchema] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to generate schema',
        endpoint: '/generateSchema'
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
    
    const nullableClause = analysis.nullable ? '' : ' NOT NULL'
    return `  "${sanitizedColumn}" ${sqlType}${nullableClause}`
  }).join(',\n')
  
  // Generate statements
  const createStatement = `CREATE TABLE IF NOT EXISTS "${sanitizedTableName}" (\n${columnDefs}\n);`
  
  const insertPlaceholders = headers.map(() => '?').join(', ')
  const insertStatement = `INSERT INTO "${sanitizedTableName}" (${headers.map(h => `"${DataTypeDetector.sanitizeColumnName(h)}"`).join(', ')}) VALUES (${insertPlaceholders});`
  
  const dropStatement = `DROP TABLE IF EXISTS "${sanitizedTableName}";`
  
  return {
    tableName: sanitizedTableName,
    create: createStatement,
    insert: insertStatement,
    drop: dropStatement
  }
}

function mapToPostgreSQLType(analysis: any): string {
  const type = analysis.suggestedType.toLowerCase()
  if (type.includes('int')) return 'INTEGER'
  if (type.includes('decimal') || type.includes('float')) return 'DECIMAL'
  if (type.includes('bool')) return 'BOOLEAN'
  if (type.includes('date') || type.includes('time')) return 'TIMESTAMP'
  const maxLen = Math.max(analysis.maxLength || 255, 255)
  return `VARCHAR(${maxLen})`
}

function mapToMySQLType(analysis: any): string {
  const type = analysis.suggestedType.toLowerCase()
  if (type.includes('int')) return 'INT'
  if (type.includes('decimal') || type.includes('float')) return 'DECIMAL(10,2)'
  if (type.includes('bool')) return 'BOOLEAN'
  if (type.includes('date') || type.includes('time')) return 'DATETIME'
  const maxLen = Math.max(analysis.maxLength || 255, 255)
  return `VARCHAR(${maxLen})`
}

function mapToSQLiteType(analysis: any): string {
  const type = analysis.suggestedType.toLowerCase()
  if (type.includes('int')) return 'INTEGER'
  if (type.includes('decimal') || type.includes('float')) return 'REAL'
  if (type.includes('bool')) return 'INTEGER'
  return 'TEXT'
}

function mapToMSSQLType(analysis: any): string {
  const type = analysis.suggestedType.toLowerCase()
  if (type.includes('int')) return 'INT'
  if (type.includes('decimal') || type.includes('float')) return 'DECIMAL(10,2)'
  if (type.includes('bool')) return 'BIT'
  if (type.includes('date') || type.includes('time')) return 'DATETIME2'
  const maxLen = Math.max(analysis.maxLength || 255, 255)
  return `NVARCHAR(${maxLen})`
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: '/generateSchema',
    method: 'POST',
    description: 'Generate database schema from sample data',
    parameters: {
      data: 'array of arrays - sample data for analysis',
      headers: 'array of strings - column headers',
      tableName: 'string - desired table name',
      databaseType: 'string - optional, default "postgresql" (postgresql|mysql|sqlite|mssql)'
    },
    usage: 'POST /generateSchema with JSON body',
    example: {
      data: [
        [1, 'John Doe', 'john@example.com', true],
        [2, 'Jane Smith', 'jane@example.com', false]
      ],
      headers: ['id', 'name', 'email', 'active'],
      tableName: 'users',
      databaseType: 'postgresql'
    }
  })
}
