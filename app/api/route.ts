import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const apiDocumentation = {
    name: 'Ingesta API',
    version: '1.0.0',
    description: 'Excel to Database Migration API',
    totalEndpoints: 18,
    status: 'active',
    
    endpoints: {
      excel: {
        upload: {
          method: 'POST',
          path: '/api/excel/upload',
          description: 'Upload and parse Excel files',
          parameters: ['files: File[]'],
          returns: 'ParsedData with file and sheet information'
        },
        analyze: {
          method: 'POST', 
          path: '/api/excel/analyze',
          description: 'Analyze parsed Excel data for quality and structure',
          parameters: ['parsedData: ParsedData'],
          returns: 'Data quality analysis and structure information'
        }
      },
      database: {
        connections: {
          method: 'GET/POST/DELETE',
          path: '/api/database/connections',
          description: 'Manage database connections (list, save, delete)',
          parameters: ['connection: DatabaseConfig (POST)', 'id: string (DELETE)'],
          returns: 'Connection list or operation result'
        },
        testConnection: {
          method: 'POST',
          path: '/api/database/test-connection',
          description: 'Test database connection',
          parameters: ['config: DatabaseConfig'],
          returns: 'Connection test result'
        },
        getTables: {
          method: 'POST',
          path: '/api/database/get-tables',
          description: 'Get existing database tables',
          parameters: ['config: DatabaseConfig'],
          returns: 'List of existing database tables'
        },
        previewTable: {
          method: 'POST',
          path: '/api/database/preview-table',
          description: 'Preview table data',
          parameters: ['config: DatabaseConfig', 'tableName: string', 'limit?: number'],
          returns: 'Table columns and sample data'
        },
        createTable: {
          method: 'POST',
          path: '/api/database/create-table',
          description: 'Create database table',
          parameters: ['config: DatabaseConfig', 'tableName: string', 'columns: any[]'],
          returns: 'Table creation result'
        },
        insertData: {
          method: 'POST',
          path: '/api/database/insert-data',
          description: 'Insert data into database',
          parameters: ['config: DatabaseConfig', 'tableName: string', 'data: any[][]'],
          returns: 'Data insertion result'
        }
      },
      sheets: {
        analyze: {
          method: 'POST',
          path: '/api/sheets/analyze',
          description: 'Analyze sheets for database mapping possibilities',
          parameters: ['parsedData: any', 'databaseConfig: DatabaseConfig'],
          returns: 'Sheet analysis with mapping recommendations'
        },
        select: {
          method: 'POST',
          path: '/api/sheets/select',
          description: 'Process sheet selections for workflow',
          parameters: ['selectedSheets: SheetSelection[]'],
          returns: 'Selection analysis and next step recommendations'
        }
      },
      tables: {
        configure: {
          method: 'POST',
          path: '/api/tables/configure',
          description: 'Configure table creation parameters',
          parameters: ['databaseConfig: DatabaseConfig', 'sheetsData: SheetData[]'],
          returns: 'Table configuration specifications'
        },
        create: {
          method: 'POST',
          path: '/api/tables/create',
          description: 'Create database table and insert data',
          parameters: ['databaseConfig: DatabaseConfig', 'tableConfig: TableCreationConfig', 'sheetData: SheetData'],
          returns: 'Table creation and data insertion result'
        }
      },
      data: {
        import: {
          method: 'POST',
          path: '/api/data/import',
          description: 'Import data using sheet mappings',
          parameters: ['databaseConfig: DatabaseConfig', 'mappings: SheetMapping[]', 'sheetData: SheetData[]'],
          returns: 'Data import results for each mapping'
        },
        insert: {
          method: 'POST',
          path: '/api/data/insert',
          description: 'Insert data directly into a table',
          parameters: ['databaseConfig: DatabaseConfig', 'tableName: string', 'data: any[][]', 'headers: string[]'],
          returns: 'Data insertion result'
        },
        insertClean: {
          method: 'POST',
          path: '/api/data/insert-clean',
          description: 'Insert data with cleaning and null handling',
          parameters: ['databaseConfig: DatabaseConfig', 'tableName: string', 'data: any[][]', 'headers: string[]'],
          returns: 'Cleaned data insertion result'
        }
      },
      sql: {
        generate: {
          method: 'POST',
          path: '/api/sql/generate',
          description: 'Generate SQL statements from mappings',
          parameters: ['databaseConfig: DatabaseConfig', 'mappings: SheetMapping[]', 'excelFiles: ExcelFile[]', 'databaseTables: DatabaseTable[]', 'options?: SQLGenerationOptions'],
          returns: 'Generated SQL statements and execution plan'
        },
        execute: {
          method: 'POST',
          path: '/api/sql/execute',
          description: 'Execute SQL statements',
          parameters: ['databaseConfig: DatabaseConfig', 'sqlStatements: string[]'],
          returns: 'SQL execution results'
        }
      },
      validation: {
        data: {
          method: 'POST',
          path: '/api/validation/data',
          description: 'Validate and clean data before insertion',
          parameters: ['data: any[][]', 'headers: string[]', 'validationRules?: object'],
          returns: 'Validation results and cleaned data'
        }
      },
      files: {
        history: {
          method: 'GET/DELETE',
          path: '/api/files/history',
          description: 'Manage file upload history',
          parameters: ['type?: string', 'limit?: number', 'id?: string (DELETE)'],
          returns: 'File history list or deletion result'
        }
      },
      schema: {
        generate: {
          method: 'POST',
          path: '/api/schema/generate',
          description: 'Generate database schema from data',
          parameters: ['data: any[][]', 'headers: string[]', 'tableName: string', 'databaseType?: string'],
          returns: 'Generated schema with CREATE, INSERT, and DROP statements'
        }
      },
      system: {
        health: {
          method: 'GET',
          path: '/api/system/health',
          description: 'System health and status information',
          parameters: [],
          returns: 'System health status and API information'
        }
      }
    },

    workflow: {
      description: 'Complete Excel to Database migration workflow',
      steps: [
        {
          step: 1,
          name: 'Upload Excel',
          endpoint: '/api/excel/upload',
          description: 'Upload Excel files and parse their content'
        },
        {
          step: 2,
          name: 'Analyze Data',
          endpoint: '/api/excel/analyze',
          description: 'Analyze data quality and structure'
        },
        {
          step: 3,
          name: 'Connect Database',
          endpoints: ['/api/database/connections', '/api/database/test-connection'],
          description: 'Manage database connections and test connectivity'
        },
        {
          step: 4,
          name: 'Analyze Sheets',
          endpoint: '/api/sheets/analyze',
          description: 'Analyze sheets for database mapping possibilities'
        },
        {
          step: 5,
          name: 'Select Sheets',
          endpoint: '/api/sheets/select',
          description: 'Select sheets and define actions (create/map)'
        },
        {
          step: 6,
          name: 'Configure Tables',
          endpoint: '/api/tables/configure',
          description: 'Configure table creation parameters'
        },
        {
          step: 7,
          name: 'Create Tables',
          endpoint: '/api/tables/create',
          description: 'Create tables and insert data'
        },
        {
          step: 8,
          name: 'Preview Tables',
          endpoint: '/api/database/preview-table',
          description: 'Preview created tables and their data'
        },
        {
          step: 9,
          name: 'Generate SQL (Optional)',
          endpoint: '/api/sql/generate',
          description: 'Generate SQL statements for review or export'
        }
      ]
    },

    usage: {
      baseUrl: 'http://localhost:3000',
      authentication: 'None (development)',
      contentType: 'application/json',
      examples: {
        uploadFile: 'POST /api/excel/upload with FormData',
        testConnection: 'POST /api/database/test-connection with DatabaseConfig',
        createTable: 'POST /api/tables/create with table configuration'
      }
    }
  }

  return NextResponse.json(apiDocumentation)
}
