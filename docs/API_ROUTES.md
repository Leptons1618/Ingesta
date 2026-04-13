# Ingesta API Routes Documentation

This document describes all the API routes available in the Ingesta application, organized by functionality and workflow step.

## 📋 Overview

The Ingesta API provides comprehensive endpoints for Excel-to-Database migration workflow. Each tab/step in the UI has corresponding API endpoints that can be used independently or as part of the complete workflow.

## 🗂️ Route Organization

### 1. Excel Processing (`/api/excel/`)

#### `POST /api/excel/upload`
**Purpose:** Upload and parse Excel files
**Parameters:**
- `files: File[]` - Array of Excel files to process

**Response:**
```json
{
  "success": true,
  "data": "ParsedData object with file and sheet information",
  "message": "Successfully processed N file(s)"
}
```

#### `POST /api/excel/analyze`
**Purpose:** Analyze parsed Excel data for quality and structure
**Parameters:**
- `parsedData: ParsedData` - Previously parsed Excel data

**Response:**
```json
{
  "success": true,
  "analysis": "Data quality analysis and structure information",
  "message": "Data analysis completed successfully"
}
```

### 2. Database Management (`/api/database/`)

#### `GET /api/database/connections`
**Purpose:** List all saved database connections
**Response:**
```json
{
  "success": true,
  "connections": "Array of DatabaseConfig objects (without passwords)",
  "count": "Number of saved connections"
}
```

#### `POST /api/database/connections`
**Purpose:** Save a new database connection
**Parameters:**
- `connection: DatabaseConfig` - Database connection configuration

#### `DELETE /api/database/connections?id={connectionId}`
**Purpose:** Delete a saved database connection
**Parameters:**
- `id: string` - Connection ID to delete

#### `POST /api/database/test-connection`
**Purpose:** Test database connectivity
**Parameters:**
- `config: DatabaseConfig` - Database configuration to test

#### `POST /api/database/get-tables`
**Purpose:** Get existing database tables
**Parameters:**
- `config: DatabaseConfig` - Database configuration

#### `POST /api/database/preview-table`
**Purpose:** Preview table data with pagination
**Parameters:**
- `config: DatabaseConfig` - Database configuration
- `tableName: string` - Name of table to preview
- `limit?: number` - Number of rows to return (default: 100)

**Response:**
```json
{
  "success": true,
  "columns": "Array of column names",
  "data": "Array of data rows",
  "totalRows": "Number of rows returned"
}
```

#### `POST /api/database/create-table`
**Purpose:** Create database table
**Parameters:**
- `config: DatabaseConfig` - Database configuration
- `tableName: string` - Name of table to create
- `columns: any[]` - Column definitions

#### `POST /api/database/insert-data`
**Purpose:** Insert data into database table
**Parameters:**
- `config: DatabaseConfig` - Database configuration
- `tableName: string` - Target table name
- `data: any[][]` - Data rows to insert
- `columnNames?: string[]` - Explicit column names for inserts
- `execution?: object` - Execution tuning options for scale and data-quality behavior:
  - `batchSize?: number` - Chunk size (1-10000, default: 1000)
  - `continueOnChunkError?: boolean` - Continue importing next chunks if one chunk fails
  - `handleNulls?: "empty" | "default" | "skip" | "fail"` - Null-value strategy
  - `skipEmptyRows?: boolean` - Skip fully empty rows
  - `trimStrings?: boolean` - Trim string values before insert
  - `convertTypes?: boolean` - Attempt type coercion during cleaning

**Response:**
```json
{
  "success": true,
  "partialSuccess": false,
  "message": "12000 rows inserted successfully",
  "details": {
    "insertedRows": 12000,
    "skippedRows": 34,
    "warnings": [],
    "batchSize": 1000,
    "totalBatches": 12,
    "processedBatches": 12,
    "failedBatches": 0,
    "chunkErrors": [],
    "durationMs": 1453
  }
}
```

### 3. Sheet Analysis & Selection (`/api/sheets/`)

#### `POST /api/sheets/analyze`
**Purpose:** Analyze sheets for database mapping possibilities
**Parameters:**
- `parsedData: any` - Parsed Excel data
- `databaseConfig: DatabaseConfig` - Target database configuration

**Response:**
```json
{
  "success": true,
  "sheetAnalysis": "Array of sheet analysis objects",
  "existingTables": "Array of existing database tables",
  "summary": "Analysis summary with recommendations"
}
```

#### `POST /api/sheets/select`
**Purpose:** Process sheet selections and determine next steps
**Parameters:**
- `selectedSheets: SheetSelection[]` - Array of selected sheets with actions

**Response:**
```json
{
  "success": true,
  "analysis": "Selection analysis with categorized sheets",
  "message": "Successfully processed N sheet selections"
}
```

### 4. Table Management (`/api/tables/`)

#### `POST /api/tables/configure`
**Purpose:** Generate table configuration specifications
**Parameters:**
- `databaseConfig: DatabaseConfig` - Database configuration
- `sheetsData: SheetData[]` - Array of sheet data for table creation

**Response:**
```json
{
  "success": true,
  "configurations": "Array of TableCreationConfig objects",
  "summary": "Configuration summary"
}
```

#### `POST /api/tables/create`
**Purpose:** Create database table and insert data
**Parameters:**
- `databaseConfig: DatabaseConfig` - Database configuration
- `tableConfig: TableCreationConfig` - Table creation specification
- `sheetData: SheetData` - Data to insert

**Response:**
```json
{
  "success": true,
  "tableName": "Name of created table",
  "insertedRows": "Number of rows inserted",
  "message": "Success message"
}
```

### 5. Data Operations (`/api/data/`)

#### `POST /api/data/import`
**Purpose:** Import data using sheet mappings
**Parameters:**
- `databaseConfig: DatabaseConfig` - Database configuration
- `mappings: SheetMapping[]` - Array of sheet to table mappings
- `sheetData: SheetData[]` - Array of sheet data

**Response:**
```json
{
  "success": true,
  "results": "Array of import results per sheet",
  "summary": "Import summary with totals"
}
```

#### `POST /api/data/insert`
**Purpose:** Insert data directly into a specific table
**Parameters:**
- `databaseConfig: DatabaseConfig` - Database configuration
- `tableName: string` - Target table name
- `data: any[][]` - Data rows to insert
- `headers: string[]` - Column headers

**Response:**
```json
{
  "success": true,
  "tableName": "Target table name",
  "insertedRows": "Number of rows inserted"
}
```

#### `POST /api/data/insert-clean`
**Purpose:** Insert data with cleaning and null handling
**Parameters:**
- `databaseConfig: DatabaseConfig` - Database configuration
- `tableName: string` - Target table name
- `data: any[][]` - Data rows to insert
- `headers: string[]` - Column headers

**Response:**
```json
{
  "success": true,
  "tableName": "Target table name",
  "insertedRows": "Number of rows inserted",
  "cleaningReport": "Data cleaning summary"
}
```

### 6. SQL Generation (`/api/sql/`)

#### `POST /api/sql/generate`
**Purpose:** Generate SQL statements from mappings
**Parameters:**
- `databaseConfig: DatabaseConfig` - Database configuration
- `mappings: SheetMapping[]` - Sheet to table mappings
- `excelFiles: ExcelFile[]` - Source Excel files
- `databaseTables: DatabaseTable[]` - Target database tables
- `options?: SQLGenerationOptions` - Generation options

**Response:**
```json
{
  "success": true,
  "result": "Generated SQL statements and metadata",
  "summary": "Generation summary with statistics"
}
```

#### `POST /api/sql/execute`
**Purpose:** Execute SQL statements
**Parameters:**
- `databaseConfig: DatabaseConfig` - Database configuration
- `sqlStatements: string[]` - Array of SQL statements to execute

### 7. Data Validation (`/api/validation/`)

#### `POST /api/validation/data`
**Purpose:** Validate and clean data before insertion
**Parameters:**
- `data: any[][]` - Data rows to validate
- `headers: string[]` - Column headers
- `validationRules?: object` - Optional validation rules

**Response:**
```json
{
  "success": true,
  "validation": {
    "totalRows": "Number",
    "validRows": "Number",
    "invalidRows": "Number",
    "issues": "Array of validation issues",
    "cleanedData": "Array of cleaned data rows",
    "warnings": "Array of warnings"
  }
}
```

### 8. File Management (`/api/files/`)

#### `GET /api/files/history`
**Purpose:** Get file upload history
**Parameters:**
- `type?: string` - Filter by file type ('excel', 'csv', 'all')
- `limit?: number` - Maximum number of files to return

**Response:**
```json
{
  "success": true,
  "files": "Array of file history objects",
  "total": "Total number of files",
  "message": "Found N files"
}
```

#### `DELETE /api/files/history?id={fileId}`
**Purpose:** Delete a file from history
**Parameters:**
- `id: string` - File ID to delete

### 9. Schema Generation (`/api/schema/`)

#### `POST /api/schema/generate`
**Purpose:** Generate database schema from data
**Parameters:**
- `data: any[][]` - Sample data for schema analysis
- `headers: string[]` - Column headers
- `tableName: string` - Desired table name
- `databaseType?: string` - Target database type ('postgresql', 'mysql', 'sqlite', 'mssql')

**Response:**
```json
{
  "success": true,
  "schema": {
    "tableName": "Sanitized table name",
    "databaseType": "Target database type",
    "columns": "Array of column analysis",
    "createStatement": "CREATE TABLE SQL",
    "insertStatement": "INSERT SQL template",
    "dropStatement": "DROP TABLE SQL"
  }
}
```

### 10. System Status (`/api/system/`)

#### `GET /api/system/health`
**Purpose:** Get system health and API status
**Response:**
```json
{
  "status": "healthy",
  "timestamp": "ISO timestamp",
  "uptime": "Server uptime information",
  "memory": "Memory usage statistics",
  "environment": "System environment details",
  "api": "API version and endpoint list"
}
```

## 🔄 Workflow Integration

### Complete Workflow Steps:
1. **Upload** → `POST /api/excel/upload`
2. **Analyze** → `POST /api/excel/analyze`  
3. **Connect** → `POST /api/database/test-connection`
4. **Sheet Analysis** → `POST /api/sheets/analyze`
5. **Sheet Selection** → `POST /api/sheets/select`
6. **Table Configuration** → `POST /api/tables/configure`
7. **Table Creation** → `POST /api/tables/create`
8. **Table Preview** → `POST /api/database/preview-table`
9. **SQL Generation** → `POST /api/sql/generate` (optional)

### Additional Utility Routes:
- **Data Validation** → `POST /api/validation/data`
- **Schema Generation** → `POST /api/schema/generate`
- **File Management** → `GET/DELETE /api/files/history`
- **System Health** → `GET /api/system/health`

### Error Handling
All endpoints return consistent error responses:
```json
{
  "success": false,
  "message": "Error description",
  "details": "Additional error context (optional)"
}
```

### Authentication
Currently, no authentication is required. In production, consider adding:
- API key authentication
- Rate limiting
- Request validation middleware

### Database Support
All database-related endpoints support:
- PostgreSQL
- MySQL
- SQLite
- Microsoft SQL Server

### Testing
Use the documentation endpoint for API overview:
```bash
curl http://localhost:3000/api
```

## 📝 Notes

- All endpoints accept JSON payloads and return JSON responses
- Include proper error handling for all operations
- Database connections are tested before executing operations
- Table creation includes automatic data type detection
- Preview functionality supports pagination
- SQL generation provides multiple output formats
- Comprehensive logging is available for debugging
- Data cleaning and validation utilities included
- Schema generation supports multiple database types

## 🚀 Usage Examples

### Basic Workflow Example:
```bash
# 1. Upload Excel file
curl -X POST http://localhost:3000/api/excel/upload \
  -F "files=@data.xlsx"

# 2. Test database connection
curl -X POST http://localhost:3000/api/database/test-connection \
  -H "Content-Type: application/json" \
  -d '{"type":"postgresql","host":"localhost","database":"mydb",...}'

# 3. Validate data before insertion
curl -X POST http://localhost:3000/api/validation/data \
  -H "Content-Type: application/json" \
  -d '{"data":[...],"headers":[...],"validationRules":{...}}'

# 4. Generate schema
curl -X POST http://localhost:3000/api/schema/generate \
  -H "Content-Type: application/json" \
  -d '{"data":[...],"headers":[...],"tableName":"my_table","databaseType":"postgresql"}'

# 5. Create table
curl -X POST http://localhost:3000/api/tables/create \
  -H "Content-Type: application/json" \
  -d '{"databaseConfig":{...},"tableConfig":{...},"sheetData":{...}}'

# 6. Preview created table
curl -X POST http://localhost:3000/api/database/preview-table \
  -H "Content-Type: application/json" \
  -d '{"config":{...},"tableName":"my_table","limit":10}'

# 7. Check system health
curl http://localhost:3000/api/system/health
```

## Total API Routes: 22

Your Ingesta application now has a comprehensive API with 22 endpoints covering every aspect of the Excel-to-database workflow, plus additional utility routes for validation, schema generation, file management, and system monitoring.
