export interface ColumnAnalysis {
  name: string
  suggestedType: string
  nullable: boolean
  maxLength?: number
  samples: any[]
  uniqueValues: number
  nullCount: number
  totalCount: number
}

export interface TableCreationConfig {
  tableName: string
  columns: ColumnAnalysis[]
  primaryKey?: string
  indexes?: string[]
}

export class DataTypeDetector {
  static analyzeColumn(columnName: string, values: any[]): ColumnAnalysis {
    const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '')
    const totalCount = values.length
    const nullCount = totalCount - nonNullValues.length
    const uniqueValues = new Set(nonNullValues).size
    
    // Get sample values for user reference
    const samples = [...new Set(nonNullValues)].slice(0, 5)
    
    let suggestedType = 'VARCHAR(255)'
    let maxLength = 0

    if (nonNullValues.length === 0) {
      return {
        name: columnName,
        suggestedType: 'VARCHAR(255)',
        nullable: true,
        samples,
        uniqueValues,
        nullCount,
        totalCount,
      }
    }

    // Check for various data types with better confidence scoring
    const typeChecks = {
      boolean: this.checkBoolean(nonNullValues),
      integer: this.checkInteger(nonNullValues),
      decimal: this.checkDecimal(nonNullValues),
      date: this.checkDate(nonNullValues),
      datetime: this.checkDateTime(nonNullValues),
      email: this.checkEmail(nonNullValues),
      url: this.checkUrl(nonNullValues),
      json: this.checkJson(nonNullValues),
    }

    // Determine best type based on analysis with improved logic
    if (typeChecks.boolean.confidence > 0.8) {
      suggestedType = 'BOOLEAN'
    } else if (typeChecks.datetime.confidence > 0.8) {
      // Check datetime before date to prioritize more specific type
      suggestedType = 'DATETIME'
    } else if (typeChecks.date.confidence > 0.8) {
      suggestedType = 'DATE'
    } else if (typeChecks.integer.confidence > 0.9) {
      const maxValue = Math.max(...nonNullValues.filter(v => !isNaN(v)).map(v => Math.abs(Number(v))))
      if (maxValue <= 127) suggestedType = 'TINYINT'
      else if (maxValue <= 32767) suggestedType = 'SMALLINT'
      else if (maxValue <= 2147483647) suggestedType = 'INT'
      else suggestedType = 'BIGINT'
    } else if (typeChecks.decimal.confidence > 0.9) {
      suggestedType = 'DECIMAL(10,2)'
    } else if (typeChecks.email.confidence > 0.8) {
      suggestedType = 'VARCHAR(255)'
    } else if (typeChecks.url.confidence > 0.8) {
      suggestedType = 'VARCHAR(500)'
    } else if (typeChecks.json.confidence > 0.8) {
      suggestedType = 'JSON'
    } else {
      // String analysis with improved length detection
      maxLength = Math.max(...nonNullValues.map(v => String(v).length))
      if (maxLength <= 10) suggestedType = 'VARCHAR(20)'
      else if (maxLength <= 50) suggestedType = 'VARCHAR(100)'
      else if (maxLength <= 255) suggestedType = 'VARCHAR(255)'
      else if (maxLength <= 1000) suggestedType = 'VARCHAR(1000)'
      else suggestedType = 'TEXT'
    }

    return {
      name: columnName,
      suggestedType,
      nullable: nullCount > 0,
      maxLength: maxLength > 0 ? maxLength : undefined,
      samples,
      uniqueValues,
      nullCount,
      totalCount,
    }
  }

  static analyzeSheet(sheetData: any[][], sheetName: string, headers?: string[]): TableCreationConfig {
    if (sheetData.length === 0) {
      return {
        tableName: this.sanitizeTableName(sheetName),
        columns: [],
      }
    }

    // Use provided headers or extract from first row
    const columnHeaders = headers || sheetData[0]?.map((h, i) => h || `column_${i + 1}`) || []
    const dataRows = headers ? sheetData : sheetData.slice(1)
    
    const columns: ColumnAnalysis[] = columnHeaders.map((header, colIndex) => {
      const columnValues = dataRows.map(row => row[colIndex])
      return this.analyzeColumn(this.sanitizeColumnName(String(header)), columnValues)
    })

    // Suggest primary key (first column with unique values or create ID)
    const uniqueColumn = columns.find(col => 
      col.uniqueValues === col.totalCount - col.nullCount && col.nullCount === 0
    )

    return {
      tableName: this.sanitizeTableName(sheetName),
      columns,
      primaryKey: uniqueColumn?.name || 'id',
    }
  }

  private static checkBoolean(values: any[]): { confidence: number; details: any } {
    const booleanWords = new Set(['true', 'false', 'yes', 'no', '1', '0', 'y', 'n'])
    const matches = values.filter(v => 
      booleanWords.has(String(v).toLowerCase()) || typeof v === 'boolean'
    ).length
    
    return {
      confidence: matches / values.length,
      details: { matches, total: values.length }
    }
  }

  private static checkInteger(values: any[]): { confidence: number; details: any } {
    const matches = values.filter(v => {
      const num = Number(v)
      return !isNaN(num) && Number.isInteger(num)
    }).length
    
    return {
      confidence: matches / values.length,
      details: { matches, total: values.length }
    }
  }

  private static checkDecimal(values: any[]): { confidence: number; details: any } {
    const matches = values.filter(v => {
      const num = Number(v)
      return !isNaN(num) && !Number.isInteger(num)
    }).length
    
    return {
      confidence: matches / values.length,
      details: { matches, total: values.length }
    }
  }

  private static checkDate(values: any[]): { confidence: number; details: any } {
    const matches = values.filter(v => {
      if (v === null || v === undefined || v === '') return false
      
      // Handle Excel serial date numbers (common in .xlsx files)
      if (typeof v === 'number' && v > 1 && v < 100000) {
        // Excel dates are stored as numbers since 1900-01-01
        const excelDate = new Date((v - 25569) * 86400 * 1000)
        if (!isNaN(excelDate.getTime()) && excelDate.getFullYear() > 1900 && excelDate.getFullYear() < 2100) {
          return true
        }
      }
      
      // Handle string dates
      const str = String(v).trim()
      if (str.length === 0) return false
      
      const date = new Date(str)
      if (isNaN(date.getTime())) return false
      
      // Check various date patterns
      const datePatterns = [
        /^\d{4}-\d{2}-\d{2}$/,           // YYYY-MM-DD
        /^\d{2}\/\d{2}\/\d{4}$/,        // MM/DD/YYYY
        /^\d{1,2}\/\d{1,2}\/\d{4}$/,    // M/D/YYYY
        /^\d{2}-\d{2}-\d{4}$/,          // MM-DD-YYYY
        /^\d{1,2}-\d{1,2}-\d{4}$/,      // M-D-YYYY
        /^\d{4}\/\d{2}\/\d{2}$/,        // YYYY/MM/DD
        /^\d{2}\.\d{2}\.\d{4}$/,        // DD.MM.YYYY
        /^[A-Za-z]{3}\s+\d{1,2},?\s+\d{4}$/, // Month DD, YYYY
        /^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/,   // DD Month YYYY
      ]
      
      const hasDatePattern = datePatterns.some(pattern => pattern.test(str))
      const hasReasonableYear = date.getFullYear() >= 1900 && date.getFullYear() <= 2100
      
      return hasDatePattern && hasReasonableYear
    }).length
    
    return {
      confidence: matches / values.length,
      details: { matches, total: values.length }
    }
  }

  private static checkDateTime(values: any[]): { confidence: number; details: any } {
    const matches = values.filter(v => {
      if (v === null || v === undefined || v === '') return false
      
      // Handle Excel serial date numbers with time components
      if (typeof v === 'number' && v > 1 && v < 100000) {
        const excelDate = new Date((v - 25569) * 86400 * 1000)
        if (!isNaN(excelDate.getTime()) && excelDate.getFullYear() > 1900 && excelDate.getFullYear() < 2100) {
          // Check if it has a fractional part (indicating time)
          return v % 1 !== 0
        }
      }
      
      const str = String(v).trim()
      if (str.length === 0) return false
      
      const date = new Date(str)
      if (isNaN(date.getTime())) return false
      
      // Must contain time indicators
      const hasTimeIndicators = /\d{1,2}:\d{2}(:\d{2})?(\s?(AM|PM|am|pm))?/.test(str)
      const hasReasonableYear = date.getFullYear() >= 1900 && date.getFullYear() <= 2100
      
      return hasTimeIndicators && hasReasonableYear
    }).length
    
    return {
      confidence: matches / values.length,
      details: { matches, total: values.length }
    }
  }

  private static checkEmail(values: any[]): { confidence: number; details: any } {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const matches = values.filter(v => emailRegex.test(String(v))).length
    
    return {
      confidence: matches / values.length,
      details: { matches, total: values.length }
    }
  }

  private static checkUrl(values: any[]): { confidence: number; details: any } {
    const urlRegex = /^https?:\/\/.+/
    const matches = values.filter(v => urlRegex.test(String(v))).length
    
    return {
      confidence: matches / values.length,
      details: { matches, total: values.length }
    }
  }

  private static checkJson(values: any[]): { confidence: number; details: any } {
    const matches = values.filter(v => {
      try {
        JSON.parse(String(v))
        return true
      } catch {
        return false
      }
    }).length
    
    return {
      confidence: matches / values.length,
      details: { matches, total: values.length }
    }
  }

  static sanitizeTableName(name: string): string {
    if (!name || typeof name !== 'string') {
      return 'table_1'
    }
    
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^[0-9]/, 'table_$&')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 63) // Common DB limit
      || 'table_1' // Fallback if everything gets stripped
  }

  static sanitizeColumnName(name: string): string {
    if (!name || typeof name !== 'string') {
      return 'unnamed_column'
    }
    
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^[0-9]/, 'col_$&')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 63) // Common DB limit
      || 'unnamed_column' // Fallback if everything gets stripped
  }

  static adaptTypeForDatabase(dataType: string, dbType: 'mysql' | 'postgresql' | 'sqlite' | 'mssql'): string {
    const typeMap: Record<string, Record<string, string>> = {
      mysql: {
        'BOOLEAN': 'BOOLEAN',
        'TINYINT': 'TINYINT',
        'SMALLINT': 'SMALLINT', 
        'INT': 'INT',
        'BIGINT': 'BIGINT',
        'DECIMAL(10,2)': 'DECIMAL(10,2)',
        'DATE': 'DATE',
        'DATETIME': 'DATETIME',
        'JSON': 'JSON',
        'TEXT': 'TEXT'
      },
      postgresql: {
        'BOOLEAN': 'BOOLEAN',
        'TINYINT': 'SMALLINT',
        'SMALLINT': 'SMALLINT',
        'INT': 'INTEGER',
        'BIGINT': 'BIGINT',
        'DECIMAL(10,2)': 'DECIMAL(10,2)',
        'DATE': 'DATE',
        'DATETIME': 'TIMESTAMP',
        'JSON': 'JSONB',
        'TEXT': 'TEXT'
      },
      sqlite: {
        'BOOLEAN': 'INTEGER',
        'TINYINT': 'INTEGER',
        'SMALLINT': 'INTEGER',
        'INT': 'INTEGER',
        'BIGINT': 'INTEGER',
        'DECIMAL(10,2)': 'REAL',
        'DATE': 'TEXT',
        'DATETIME': 'TEXT',
        'JSON': 'TEXT',
        'TEXT': 'TEXT'
      },
      mssql: {
        'BOOLEAN': 'BIT',
        'TINYINT': 'TINYINT',
        'SMALLINT': 'SMALLINT',
        'INT': 'INT',
        'BIGINT': 'BIGINT',
        'DECIMAL(10,2)': 'DECIMAL(10,2)',
        'DATE': 'DATE',
        'DATETIME': 'DATETIME2',
        'JSON': 'NVARCHAR(MAX)',
        'TEXT': 'NVARCHAR(MAX)'
      }
    }

    // Handle VARCHAR types
    if (dataType.startsWith('VARCHAR')) {
      if (dbType === 'mssql') {
        return dataType.replace('VARCHAR', 'NVARCHAR')
      }
      return dataType
    }

    return typeMap[dbType]?.[dataType] || dataType
  }
}
