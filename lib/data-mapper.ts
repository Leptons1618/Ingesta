export interface ColumnMapping {
  id: string
  excelColumn: string
  excelColumnIndex: number
  databaseTable: string
  databaseColumn: string
  dataType: string
  transformation?: "none" | "uppercase" | "lowercase" | "trim" | "date_format"
  defaultValue?: string
  nullable: boolean
}

export interface SheetMapping {
  sheetName: string
  targetTable: string
  mappings: ColumnMapping[]
  insertMode: "insert" | "upsert" | "replace"
}

export interface MappingConfiguration {
  id: string
  name: string
  excelFileName: string
  databaseConnection: string
  sheetMappings: SheetMapping[]
  createdAt: Date
}

export class DataMapper {
  static createMapping(
    excelColumn: string,
    excelColumnIndex: number,
    databaseTable: string,
    databaseColumn: string,
    dataType: string,
    nullable = true,
  ): ColumnMapping {
    return {
      id: `${excelColumn}_${databaseTable}_${databaseColumn}_${Date.now()}`,
      excelColumn,
      excelColumnIndex,
      databaseTable,
      databaseColumn,
      dataType,
      transformation: "none",
      nullable,
    }
  }

  static validateMapping(
    mapping: ColumnMapping,
    sampleData: any[],
  ): {
    isValid: boolean
    errors: string[]
    warnings: string[]
  } {
    const errors: string[] = []
    const warnings: string[] = []

    // Check if we have sample data
    if (sampleData.length === 0) {
      warnings.push("No sample data available for validation")
      return { isValid: true, errors, warnings }
    }

    // Get sample values from the mapped column
    const sampleValues = sampleData
      .slice(0, 10)
      .map((row) => row[mapping.excelColumnIndex])
      .filter((val) => val !== null && val !== undefined && val !== "")

    if (sampleValues.length === 0) {
      if (!mapping.nullable) {
        errors.push(`Column "${mapping.excelColumn}" contains only empty values but is marked as non-nullable`)
      }
      return { isValid: errors.length === 0, errors, warnings }
    }

    // Validate data types
    switch (mapping.dataType.toLowerCase()) {
      case "int":
      case "integer":
      case "bigint":
        sampleValues.forEach((val, idx) => {
          if (isNaN(Number(val)) || !Number.isInteger(Number(val))) {
            errors.push(`Row ${idx + 1}: "${val}" is not a valid integer`)
          }
        })
        break

      case "decimal":
      case "float":
      case "double":
        sampleValues.forEach((val, idx) => {
          if (isNaN(Number(val))) {
            errors.push(`Row ${idx + 1}: "${val}" is not a valid number`)
          }
        })
        break

      case "date":
      case "datetime":
      case "timestamp":
        sampleValues.forEach((val, idx) => {
          if (isNaN(Date.parse(val))) {
            warnings.push(`Row ${idx + 1}: "${val}" may not be a valid date`)
          }
        })
        break

      case "varchar":
      case "text":
      case "char":
        // Extract length from type like VARCHAR(255)
        const lengthMatch = mapping.dataType.match(/$$(\d+)$$/)
        if (lengthMatch) {
          const maxLength = Number.parseInt(lengthMatch[1])
          sampleValues.forEach((val, idx) => {
            if (String(val).length > maxLength) {
              warnings.push(`Row ${idx + 1}: Text length (${String(val).length}) exceeds maximum (${maxLength})`)
            }
          })
        }
        break
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    }
  }

  static generatePreview(
    sheetMapping: SheetMapping,
    excelData: any[][],
    maxRows = 5,
  ): { headers: string[]; rows: any[][] } {
    const headers = sheetMapping.mappings.map((m) => `${m.excelColumn} → ${m.databaseColumn}`)
    const rows = excelData.slice(0, maxRows).map((row) =>
      sheetMapping.mappings.map((mapping) => {
        let value = row[mapping.excelColumnIndex]

        // Apply transformations
        if (value !== null && value !== undefined) {
          switch (mapping.transformation) {
            case "uppercase":
              value = String(value).toUpperCase()
              break
            case "lowercase":
              value = String(value).toLowerCase()
              break
            case "trim":
              value = String(value).trim()
              break
            case "date_format":
              if (!isNaN(Date.parse(value))) {
                value = new Date(value).toISOString().split("T")[0]
              }
              break
          }
        }

        return value || mapping.defaultValue || null
      }),
    )

    return { headers, rows }
  }

  static exportMappingConfiguration(config: MappingConfiguration): string {
    return JSON.stringify(config, null, 2)
  }

  static importMappingConfiguration(jsonString: string): MappingConfiguration {
    const config = JSON.parse(jsonString)
    return {
      ...config,
      createdAt: new Date(config.createdAt),
    }
  }
}
