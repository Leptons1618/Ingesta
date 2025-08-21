import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const directEndpoints = {
    name: 'Ingesta Direct Endpoints',
    description: 'Simple, direct access endpoints without /api/ prefix',
    baseUrl: 'http://localhost:3000',
    totalEndpoints: 10,
    
    endpoints: [
      {
        path: '/upload',
        method: 'POST',
        description: 'Upload and parse Excel files',
        example: 'curl -X POST http://localhost:3000/upload -F "files=@data.xlsx"'
      },
      {
        path: '/previewData', 
        method: 'POST',
        description: 'Preview table data from database',
        example: 'curl -X POST http://localhost:3000/previewData -H "Content-Type: application/json" -d \'{"config":{...},"tableName":"my_table"}\''
      },
      {
        path: '/testConnection',
        method: 'POST', 
        description: 'Test database connection',
        example: 'curl -X POST http://localhost:3000/testConnection -H "Content-Type: application/json" -d \'{"type":"postgresql","host":"localhost",...}\''
      },
      {
        path: '/createTable',
        method: 'POST',
        description: 'Create database table and insert data',
        example: 'curl -X POST http://localhost:3000/createTable -H "Content-Type: application/json" -d \'{"databaseConfig":{...},"tableConfig":{...},"sheetData":{...}}\''
      },
      {
        path: '/insertData',
        method: 'POST',
        description: 'Insert data into existing table (with optional cleaning)',
        example: 'curl -X POST http://localhost:3000/insertData -H "Content-Type: application/json" -d \'{"databaseConfig":{...},"tableName":"my_table","data":[[...]],"headers":[...]}\''
      },
      {
        path: '/validateData',
        method: 'POST',
        description: 'Validate and clean data before insertion',
        example: 'curl -X POST http://localhost:3000/validateData -H "Content-Type: application/json" -d \'{"data":[[...]],"headers":[...],"validationRules":{...}}\''
      },
      {
        path: '/generateSchema',
        method: 'POST',
        description: 'Generate database schema from sample data',
        example: 'curl -X POST http://localhost:3000/generateSchema -H "Content-Type: application/json" -d \'{"data":[[...]],"headers":[...],"tableName":"my_table","databaseType":"postgresql"}\''
      },
      {
        path: '/getTables',
        method: 'POST',
        description: 'Get list of tables from database',
        example: 'curl -X POST http://localhost:3000/getTables -H "Content-Type: application/json" -d \'{"config":{...}}\''
      },
      {
        path: '/analyzeSheets',
        method: 'POST',
        description: 'Analyze Excel sheets for database mapping',
        example: 'curl -X POST http://localhost:3000/analyzeSheets -H "Content-Type: application/json" -d \'{"parsedData":{...}}\''
      },
      {
        path: '/health',
        method: 'GET',
        description: 'Get system health and status information',
        example: 'curl http://localhost:3000/health'
      }
    ],
    
    quickStart: {
      description: 'Complete workflow using direct endpoints',
      steps: [
        '1. Upload file: POST /upload',
        '2. Test database: POST /testConnection', 
        '3. Analyze sheets: POST /analyzeSheets',
        '4. Generate schema: POST /generateSchema',
        '5. Create table: POST /createTable',
        '6. Preview data: POST /previewData'
      ]
    },
    
    features: [
      'Simple HTTP endpoints without nested paths',
      'Consistent JSON request/response format',
      'Built-in data validation and cleaning',
      'Multi-database support (PostgreSQL, MySQL, SQLite, MSSQL)',
      'Comprehensive error handling',
      'Self-documenting endpoints (GET requests show usage)',
      'Real-time system health monitoring'
    ],
    
    documentation: {
      detailedApi: '/api',
      systemHealth: '/health', 
      endpointList: '/endpoints'
    }
  }
  
  return NextResponse.json(directEndpoints)
}
