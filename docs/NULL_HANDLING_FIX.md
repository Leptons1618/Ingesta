# Null Value Handling Fix

## Problem Description

The application was encountering PostgreSQL NOT NULL constraint violations when trying to insert data with null values into non-nullable columns. The specific error was:

```
❌ PostgreSQL Insert Error: error: null value in column "supplier" of relation "inventory" violates not-null constraint
Failing row contains (ITM100, Bolt, Tools, 418, 71, null).
```

## Root Cause

- Excel data contained null/empty values in the "supplier" column
- The database table had a NOT NULL constraint on the "supplier" column
- The data insertion process was not handling null values appropriately
- Raw data was being inserted without preprocessing or validation

## Solution Implemented

### 1. Enhanced Database Manager (`lib/database-manager.ts`)

**Updated all database insertion methods** for PostgreSQL, MySQL, SQLite, and MSSQL:

- **Null Detection**: Added preprocessing to detect null/undefined values before insertion
- **Default Value Substitution**: Convert null values to empty strings for NOT NULL columns
- **Error-Specific Handling**: Added database-specific error code detection:
  - PostgreSQL: Error code `23502` (NOT NULL constraint violation)
  - MySQL: Error code `ER_BAD_NULL_ERROR` or errno `1048`
  - SQLite: Error message contains "NOT NULL constraint failed"
  - MSSQL: Error number `515`
- **Graceful Degradation**: Skip problematic rows and continue processing instead of failing completely
- **Enhanced Logging**: Added detailed logging for debugging and monitoring

### 2. Data Cleaning Utility (`lib/data-cleaner.ts`)

**Created a comprehensive data preprocessing system:**

```typescript
interface DataCleaningOptions {
  handleNulls: 'empty' | 'default' | 'skip' | 'fail'
  defaultValues?: Record<string, any>
  skipEmptyRows?: boolean
  trimStrings?: boolean
  convertTypes?: boolean
}
```

**Key Features:**
- **Smart Default Values**: Automatic default value generation based on data types
- **Configurable Null Handling**: Multiple strategies for handling null values
- **Type Conversion**: Optional automatic type conversion for better data consistency
- **Row Validation**: Skip completely empty rows or rows with critical null values
- **Warning System**: Comprehensive warning and error reporting

### 3. Enhanced API Endpoints

**Updated `/api/database/insert-data/route.ts`:**
- Now uses `insertDataWithCleaning()` method by default
- Provides detailed feedback about skipped rows and warnings
- Better error handling and user feedback

**Added `/api/data/insert-clean/route.ts`:**
- Dedicated endpoint for advanced data cleaning
- Customizable cleaning options
- Detailed reporting of data issues and resolutions

### 4. Default Cleaning Configuration

The system now applies these cleaning rules by default:

```typescript
{
  handleNulls: 'default',      // Replace nulls with appropriate defaults
  skipEmptyRows: true,         // Skip completely empty rows
  trimStrings: true,           // Remove leading/trailing whitespace
  convertTypes: false          // Keep original data types
}
```

## Before vs After

### Before (Failed):
```
Row: ['ITM100', 'Bolt', 'Tools', '418', 71, null]
Result: ❌ PostgreSQL Error: null value in column "supplier" violates not-null constraint
```

### After (Success):
```
Row: ['ITM100', 'Bolt', 'Tools', '418', 71, null]
Processed: ['ITM100', 'Bolt', 'Tools', '418', 71, '']
Result: ✅ Row inserted successfully with default value for supplier column
Warning: "Row 1, Column supplier: NULL value replaced with default: ''"
```

## Benefits

1. **Robust Data Insertion**: Handles real-world messy data gracefully
2. **Detailed Feedback**: Users know exactly what data issues were found and resolved
3. **Configurable**: Different cleaning strategies for different use cases
4. **Database Agnostic**: Works consistently across PostgreSQL, MySQL, SQLite, and MSSQL
5. **Non-Breaking**: Backwards compatible with existing functionality
6. **Transparent**: Full logging and warning system for debugging

## Testing

The fix has been implemented with:
- ✅ Compilation checks passed for all database managers
- ✅ New API endpoints created and tested
- ✅ Enhanced error handling with database-specific error codes
- ✅ Comprehensive logging for monitoring and debugging

## Usage Examples

### Basic Usage (Automatic Cleaning):
```typescript
// API call will automatically clean null values
const result = await fetch('/api/database/insert-data', {
  method: 'POST',
  body: JSON.stringify({
    config: databaseConfig,
    tableName: 'inventory',
    data: dataWithNulls,
    columnNames: headers
  })
})
```

### Advanced Usage (Custom Cleaning):
```typescript
// Custom cleaning options
const result = await fetch('/api/data/insert-clean', {
  method: 'POST',
  body: JSON.stringify({
    config: databaseConfig,
    tableName: 'inventory',
    data: dataWithNulls,
    columnNames: headers,
    cleaningOptions: {
      handleNulls: 'default',
      defaultValues: { 'supplier': 'Unknown Supplier' },
      skipEmptyRows: true,
      trimStrings: true
    }
  })
})
```

## Response Format

```json
{
  "success": true,
  "insertedRows": 150,
  "skippedRows": 3,
  "warnings": [
    "Row 5, Column supplier: NULL value replaced with default: ''",
    "Row 12: Skipped empty row",
    "Row 25, Column price: NULL value replaced with default: 0"
  ],
  "message": "Successfully inserted 150 rows (3 rows skipped due to data issues)"
}
```

This solution ensures that the application can handle real-world Excel data with null values, missing data, and inconsistent formatting while providing clear feedback about any data quality issues encountered during the import process.
