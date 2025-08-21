import { NextRequest, NextResponse } from 'next/server'
import { SQLGenerator, type SQLGenerationOptions } from '@/lib/sql-generator'
import { type DatabaseConfig, type DatabaseTable } from '@/lib/database-manager'
import { type SheetMapping } from '@/lib/data-mapper'
import { type ExcelFile } from '@/lib/excel-parser'

export async function POST(request: NextRequest) {
  try {
    const { 
      databaseConfig,
      mappings,
      excelFiles,
      databaseTables,
      options = {}
    }: { 
      databaseConfig: DatabaseConfig
      mappings: SheetMapping[]
      excelFiles: ExcelFile[]
      databaseTables: DatabaseTable[]
      options?: Partial<SQLGenerationOptions>
    } = await request.json()
    
    console.log('🔧 [API/sql/generate] Generating SQL statements')
    console.log(`Database: ${databaseConfig.type}, Mappings: ${mappings.length}`)
    
    const sqlOptions: SQLGenerationOptions = {
      dialect: databaseConfig.type as "mysql" | "postgresql" | "sqlite" | "mssql",
      includeCreateTable: options.includeCreateTable !== false,
      includeDropTable: options.includeDropTable || false,
      batchSize: options.batchSize || 1000,
      useTransactions: options.useTransactions !== false,
      onConflict: options.onConflict || "ignore"
    }
    
    const result = SQLGenerator.generateSQL(
      mappings,
      excelFiles,
      databaseTables,
      sqlOptions
    )
    
    console.log(`✅ [API/sql/generate] Generated ${result.totalStatements} SQL statements`)
    
    return NextResponse.json({
      success: true,
      result,
      summary: {
        totalTables: [...new Set(mappings.map(m => m.targetTable))].length,
        totalStatements: result.totalStatements,
        estimatedRows: result.estimatedRows,
        databaseType: databaseConfig.type,
        warnings: result.warnings
      },
      message: 'SQL statements generated successfully'
    })
    
  } catch (error) {
    console.error('❌ [API/sql/generate] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to generate SQL' 
      },
      { status: 500 }
    )
  }
}
