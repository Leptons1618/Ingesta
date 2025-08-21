import { type ColumnAnalysis, DataTypeDetector } from './data-type-detector'

export class DataTransformer {
  /**
   * Converts Excel serial date number to JavaScript Date
   * Excel serial dates count days since January 1, 1900
   * Note: Excel incorrectly treats 1900 as a leap year, so we adjust for this
   */
  static excelSerialToDate(serial: number | string): Date {
    const numSerial = typeof serial === 'string' ? parseFloat(serial) : serial;
    
    if (isNaN(numSerial)) {
      throw new Error(`Invalid serial number: ${serial}`);
    }
    
    // Excel treats 1900 as a leap year (it's not), so for dates after Feb 28, 1900, we subtract 1 day
    let adjustedSerial = numSerial;
    if (numSerial > 59) {
      adjustedSerial = numSerial - 1;
    }
    
    // Excel day 1 = January 1, 1900
    // Create date using UTC to avoid timezone issues
    const utcBaseDate = Date.UTC(1900, 0, 1); // January 1, 1900 in UTC
    
    // Add days to the base date
    const resultDate = new Date(utcBaseDate + (adjustedSerial - 1) * 24 * 60 * 60 * 1000);
    
    return resultDate;
  }

  /**
   * Formats a Date object for database insertion based on database type
   */
  static formatDateForDatabase(date: Date, dbTypeOrColumnType: string = 'postgresql'): string {
    // Use UTC methods to avoid timezone issues
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    
    const typeUpper = dbTypeOrColumnType.toUpperCase();
    
    // Check if it's a column type that needs datetime format
    if (typeUpper.includes('DATETIME') || typeUpper.includes('TIMESTAMP')) {
      // Return full datetime string: YYYY-MM-DD HH:MM:SS
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const seconds = String(date.getUTCSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } else {
      // Return date only: YYYY-MM-DD
      return `${year}-${month}-${day}`;
    }
  }

  /**
   * Transform a single cell value based on its column configuration
   */
  static transformCellValue(value: any, column: ColumnAnalysis): any {
    if (value === null || value === undefined || value === '') {
      return null
    }

    const columnType = column.suggestedType.toUpperCase()

    // Handle date/datetime transformations
    if (columnType.includes('DATE') || columnType.includes('TIMESTAMP') || columnType.includes('DATETIME')) {
      // Check if it's an Excel serial number
      if (typeof value === 'number' && value > 1 && value < 100000) {
        const date = this.excelSerialToDate(value)
        return this.formatDateForDatabase(date, columnType)
      }
      
      // Check if it's already a date string or Date object
      const date = new Date(value)
      if (!isNaN(date.getTime())) {
        return this.formatDateForDatabase(date, columnType)
      }
    }

    // Handle boolean transformations
    if (columnType.includes('BOOLEAN') || columnType.includes('BIT')) {
      const str = String(value).toLowerCase()
      if (['true', 'yes', '1', 'y'].includes(str)) return true
      if (['false', 'no', '0', 'n'].includes(str)) return false
      return Boolean(value)
    }

    // Handle numeric transformations
    if (columnType.includes('INT') || columnType.includes('DECIMAL') || columnType.includes('NUMERIC') || columnType.includes('REAL')) {
      const num = Number(value)
      return isNaN(num) ? null : num
    }

    // For all other types, return as string
    return String(value)
  }

  /**
   * Transform all data rows based on column configurations
   */
  static transformDataRows(data: any[][], columns: ColumnAnalysis[]): any[][] {
    return data.map(row => 
      row.map((cell, colIndex) => {
        const column = columns[colIndex]
        if (!column) return cell
        return this.transformCellValue(cell, column)
      })
    )
  }

  /**
   * Validate that transformed data matches expected column count
   */
  static validateDataStructure(data: any[][], expectedColumns: number): void {
    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      if (row.length !== expectedColumns) {
        throw new Error(`Row ${i + 1} has ${row.length} columns, expected ${expectedColumns}`)
      }
    }
  }

  /**
   * Get sample of transformed data for preview
   */
  static getTransformedSample(data: any[][], columns: ColumnAnalysis[], sampleSize: number = 5): {
    headers: string[]
    rows: any[][]
    transformationInfo: Array<{ column: string; originalSample: any; transformedSample: any }>
  } {
    const transformedData = this.transformDataRows(data.slice(0, sampleSize), columns)
    
    const transformationInfo = columns.map((col, index) => ({
      column: col.name,
      originalSample: data[0]?.[index],
      transformedSample: transformedData[0]?.[index]
    }))

    return {
      headers: columns.map(col => col.name),
      rows: transformedData,
      transformationInfo
    }
  }
}
