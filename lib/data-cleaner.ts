/**
 * Data preprocessing utility for handling null values and data cleaning
 * before database insertion
 */

export interface DataCleaningOptions {
  handleNulls: 'empty' | 'default' | 'skip' | 'fail'
  defaultValues?: Record<string, any>
  skipEmptyRows?: boolean
  trimStrings?: boolean
  convertTypes?: boolean
}

export interface ColumnMetadata {
  name: string
  type: string
  nullable: boolean
  defaultValue?: any
}

export class DataCleaner {
  /**
   * Clean and preprocess data before database insertion
   */
  static cleanData(
    data: any[][],
    headers: string[],
    options: DataCleaningOptions = { handleNulls: 'empty' },
    columnMetadata?: ColumnMetadata[]
  ): { cleanedData: any[][], skippedRows: number[], warnings: string[] } {
    const cleanedData: any[][] = []
    const skippedRows: number[] = []
    const warnings: string[] = []

    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
      const row = data[rowIndex]
      
      // Skip completely empty rows if requested
      if (options.skipEmptyRows && this.isEmptyRow(row)) {
        skippedRows.push(rowIndex)
        warnings.push(`Row ${rowIndex + 1}: Skipped empty row`)
        continue
      }

      const cleanedRow: any[] = []
      let shouldSkipRow = false

      for (let colIndex = 0; colIndex < headers.length; colIndex++) {
        const cellValue = row[colIndex]
        const columnName = headers[colIndex]
        const metadata = columnMetadata?.find(col => col.name === columnName)

        let cleanedValue = cellValue

        // Handle null/undefined values
        if (cellValue === null || cellValue === undefined || cellValue === '') {
          const isNullable = metadata?.nullable !== false
          
          if (!isNullable && options.handleNulls === 'fail') {
            warnings.push(`Row ${rowIndex + 1}, Column ${columnName}: NULL value in NOT NULL column`)
            shouldSkipRow = true
            break
          }

          if (!isNullable && options.handleNulls === 'skip') {
            warnings.push(`Row ${rowIndex + 1}: Skipped due to NULL in NOT NULL column ${columnName}`)
            shouldSkipRow = true
            break
          }

          // Provide default values for NOT NULL columns
          if (!isNullable) {
            if (options.defaultValues && options.defaultValues[columnName] !== undefined) {
              cleanedValue = options.defaultValues[columnName]
            } else if (metadata?.defaultValue !== undefined) {
              cleanedValue = metadata.defaultValue
            } else {
              // Provide sensible defaults based on data type
              cleanedValue = this.getDefaultValueForType(metadata?.type || 'text')
            }
            warnings.push(`Row ${rowIndex + 1}, Column ${columnName}: NULL value replaced with default: ${cleanedValue}`)
          } else {
            // Column is nullable, keep null
            cleanedValue = null
          }
        }

        // Trim strings if requested
        if (options.trimStrings && typeof cleanedValue === 'string') {
          cleanedValue = cleanedValue.trim()
        }

        // Type conversion if requested
        if (options.convertTypes && metadata?.type) {
          cleanedValue = this.convertToType(cleanedValue, metadata.type)
        }

        cleanedRow.push(cleanedValue)
      }

      if (!shouldSkipRow) {
        cleanedData.push(cleanedRow)
      } else {
        skippedRows.push(rowIndex)
      }
    }

    return { cleanedData, skippedRows, warnings }
  }

  /**
   * Check if a row is completely empty
   */
  private static isEmptyRow(row: any[]): boolean {
    return row.every(cell => 
      cell === null || 
      cell === undefined || 
      (typeof cell === 'string' && cell.trim() === '')
    )
  }

  /**
   * Get a sensible default value based on data type
   */
  private static getDefaultValueForType(dataType: string): any {
    const type = dataType.toLowerCase()
    
    if (type.includes('int') || type.includes('number') || type.includes('decimal') || type.includes('float')) {
      return 0
    }
    
    if (type.includes('bool')) {
      return false
    }
    
    if (type.includes('date') || type.includes('time')) {
      return new Date().toISOString()
    }
    
    // Default to empty string for text/varchar columns
    return ''
  }

  /**
   * Convert value to appropriate type
   */
  private static convertToType(value: any, dataType: string): any {
    if (value === null || value === undefined) {
      return value
    }

    const type = dataType.toLowerCase()
    
    try {
      if (type.includes('int')) {
        return parseInt(String(value), 10) || 0
      }
      
      if (type.includes('float') || type.includes('decimal') || type.includes('number')) {
        return parseFloat(String(value)) || 0
      }
      
      if (type.includes('bool')) {
        if (typeof value === 'boolean') return value
        const stringValue = String(value).toLowerCase()
        return stringValue === 'true' || stringValue === '1' || stringValue === 'yes'
      }
      
      if (type.includes('date') || type.includes('time')) {
        if (value instanceof Date) return value
        const date = new Date(value)
        return isNaN(date.getTime()) ? new Date() : date
      }
      
      // Return as string for text columns
      return String(value)
      
    } catch (error) {
      console.warn(`Failed to convert value "${value}" to type ${dataType}:`, error)
      return value
    }
  }

  /**
   * Generate cleaning options based on database column metadata
   */
  static generateCleaningOptions(
    columnMetadata: ColumnMetadata[],
    userPreferences: Partial<DataCleaningOptions> = {}
  ): DataCleaningOptions {
    const defaultValues: Record<string, any> = {}
    
    // Generate default values for NOT NULL columns
    columnMetadata.forEach(col => {
      if (!col.nullable && col.defaultValue === undefined) {
        defaultValues[col.name] = this.getDefaultValueForType(col.type)
      }
    })

    return {
      handleNulls: userPreferences.handleNulls || 'default',
      defaultValues: { ...defaultValues, ...userPreferences.defaultValues },
      skipEmptyRows: userPreferences.skipEmptyRows !== false,
      trimStrings: userPreferences.trimStrings !== false,
      convertTypes: userPreferences.convertTypes !== false
    }
  }
}
