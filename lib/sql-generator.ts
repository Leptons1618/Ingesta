import type { SheetMapping, ColumnMapping } from "./data-mapper"
import type { DatabaseTable } from "./database-manager"
import type { ExcelFile } from "./excel-parser"

export interface SQLGenerationOptions {
  dialect: "mysql" | "postgresql" | "sqlite" | "mssql"
  includeCreateTable: boolean
  includeDropTable: boolean
  batchSize: number
  useTransactions: boolean
  onConflict: "ignore" | "replace" | "update"
}

export interface GeneratedSQL {
  createStatements: string[]
  insertStatements: string[]
  totalStatements: number
  estimatedRows: number
  warnings: string[]
}

export class SQLGenerator {
  static generateSQL(
    sheetMappings: SheetMapping[],
    excelFiles: ExcelFile[],
    databaseTables: DatabaseTable[],
    options: SQLGenerationOptions,
  ): GeneratedSQL {
    const createStatements: string[] = []
    const insertStatements: string[] = []
    const warnings: string[] = []
    let estimatedRows = 0

    // Generate CREATE TABLE statements if requested
    if (options.includeCreateTable) {
      const uniqueTables = [...new Set(sheetMappings.map((m) => m.targetTable))]

      uniqueTables.forEach((tableName) => {
        const table = databaseTables.find((t) => t.name === tableName)
        if (table) {
          if (options.includeDropTable) {
            createStatements.push(this.generateDropTable(tableName, options.dialect))
          }
          createStatements.push(this.generateCreateTable(table, options.dialect))
        }
      })
    }

    // Generate INSERT statements for each sheet mapping
    sheetMappings.forEach((sheetMapping) => {
      const sheet = this.findSheet(excelFiles, sheetMapping.sheetName)
      if (!sheet) {
        warnings.push(`Sheet "${sheetMapping.sheetName}" not found`)
        return
      }

      const insertSQL = this.generateInsertStatements(sheetMapping, sheet.data, options)

      insertStatements.push(...insertSQL.statements)
      estimatedRows += insertSQL.rowCount
      warnings.push(...insertSQL.warnings)
    })

    return {
      createStatements,
      insertStatements,
      totalStatements: createStatements.length + insertStatements.length,
      estimatedRows,
      warnings,
    }
  }

  private static findSheet(excelFiles: ExcelFile[], sheetName: string) {
    for (const file of excelFiles) {
      const sheet = file.sheets.find((s) => `${file.name} - ${s.name}` === sheetName)
      if (sheet) return sheet
    }
    return null
  }

  private static generateDropTable(tableName: string, dialect: string): string {
    const quotedTable = this.quoteIdentifier(tableName, dialect)

    switch (dialect) {
      case "mysql":
        return `DROP TABLE IF EXISTS ${quotedTable};`
      case "postgresql":
        return `DROP TABLE IF EXISTS ${quotedTable} CASCADE;`
      case "sqlite":
        return `DROP TABLE IF EXISTS ${quotedTable};`
      case "mssql":
        return `IF OBJECT_ID('${tableName}', 'U') IS NOT NULL DROP TABLE ${quotedTable};`
      default:
        return `DROP TABLE IF EXISTS ${quotedTable};`
    }
  }

  private static generateCreateTable(table: DatabaseTable, dialect: string): string {
    const quotedTable = this.quoteIdentifier(table.name, dialect)
    const columns = table.columns.map((col) => {
      const quotedColumn = this.quoteIdentifier(col.name, dialect)
      let definition = `${quotedColumn} ${this.mapDataType(col.type, dialect)}`

      if (!col.nullable) {
        definition += " NOT NULL"
      }

      if (col.isPrimaryKey) {
        definition += " PRIMARY KEY"
        if (dialect === "mysql" && col.type.toLowerCase().includes("int")) {
          definition += " AUTO_INCREMENT"
        }
        if (dialect === "postgresql" && col.type.toLowerCase().includes("int")) {
          definition = definition.replace(col.type, "SERIAL")
        }
      }

      if (col.defaultValue) {
        definition += ` DEFAULT ${col.defaultValue}`
      }

      return definition
    })

    return `CREATE TABLE ${quotedTable} (\n  ${columns.join(",\n  ")}\n);`
  }

  private static generateInsertStatements(
    sheetMapping: SheetMapping,
    data: any[][],
    options: SQLGenerationOptions,
  ): { statements: string[]; rowCount: number; warnings: string[] } {
    const statements: string[] = []
    const warnings: string[] = []
    const quotedTable = this.quoteIdentifier(sheetMapping.targetTable, options.dialect)

    if (data.length === 0) {
      warnings.push(`No data found for sheet "${sheetMapping.sheetName}"`)
      return { statements, rowCount: 0, warnings }
    }

    // Prepare column names and mappings
    const columns = sheetMapping.mappings.map((m) => this.quoteIdentifier(m.databaseColumn, options.dialect))

    if (columns.length === 0) {
      warnings.push(`No column mappings found for sheet "${sheetMapping.sheetName}"`)
      return { statements, rowCount: 0, warnings }
    }

    // Generate INSERT statements in batches
    const batches = this.createBatches(data, options.batchSize)

    batches.forEach((batch, batchIndex) => {
      const values = batch.map((row) => {
        const rowValues = sheetMapping.mappings.map((mapping) => {
          let value = row[mapping.excelColumnIndex]

          // Apply transformations
          value = this.applyTransformation(value, mapping)

          // Format value for SQL
          return this.formatValueForSQL(value, mapping.dataType, options.dialect)
        })

        return `(${rowValues.join(", ")})`
      })

      let insertStatement: string

      switch (sheetMapping.insertMode) {
        case "replace":
          insertStatement = this.generateReplaceStatement(quotedTable, columns, values, options.dialect)
          break
        case "upsert":
          insertStatement = this.generateUpsertStatement(quotedTable, columns, values, options.dialect)
          break
        default:
          insertStatement = `INSERT INTO ${quotedTable} (${columns.join(", ")}) VALUES\n  ${values.join(",\n  ")};`
      }

      if (options.useTransactions && batchIndex === 0) {
        statements.push(this.getTransactionStart(options.dialect))
      }

      statements.push(insertStatement)

      if (options.useTransactions && batchIndex === batches.length - 1) {
        statements.push(this.getTransactionEnd(options.dialect))
      }
    })

    return { statements, rowCount: data.length, warnings }
  }

  private static generateReplaceStatement(table: string, columns: string[], values: string[], dialect: string): string {
    switch (dialect) {
      case "mysql":
        return `REPLACE INTO ${table} (${columns.join(", ")}) VALUES\n  ${values.join(",\n  ")};`
      case "sqlite":
        return `INSERT OR REPLACE INTO ${table} (${columns.join(", ")}) VALUES\n  ${values.join(",\n  ")};`
      default:
        // For PostgreSQL and SQL Server, we'd need more complex UPSERT logic
        return `INSERT INTO ${table} (${columns.join(", ")}) VALUES\n  ${values.join(",\n  ")};`
    }
  }

  private static generateUpsertStatement(table: string, columns: string[], values: string[], dialect: string): string {
    switch (dialect) {
      case "postgresql":
        return `INSERT INTO ${table} (${columns.join(", ")}) VALUES\n  ${values.join(",\n  ")}\nON CONFLICT DO NOTHING;`
      case "mysql":
        return `INSERT IGNORE INTO ${table} (${columns.join(", ")}) VALUES\n  ${values.join(",\n  ")};`
      case "sqlite":
        return `INSERT OR IGNORE INTO ${table} (${columns.join(", ")}) VALUES\n  ${values.join(",\n  ")};`
      default:
        return `INSERT INTO ${table} (${columns.join(", ")}) VALUES\n  ${values.join(",\n  ")};`
    }
  }

  private static applyTransformation(value: any, mapping: ColumnMapping): any {
    if (value === null || value === undefined || value === "") {
      return mapping.defaultValue || null
    }

    switch (mapping.transformation) {
      case "uppercase":
        return String(value).toUpperCase()
      case "lowercase":
        return String(value).toLowerCase()
      case "trim":
        return String(value).trim()
      case "date_format":
        if (!isNaN(Date.parse(value))) {
          return new Date(value).toISOString().split("T")[0]
        }
        return value
      default:
        return value
    }
  }

  private static formatValueForSQL(value: any, dataType: string, dialect: string): string {
    if (value === null || value === undefined) {
      return "NULL"
    }

    const lowerType = dataType.toLowerCase()

    if (
      lowerType.includes("int") ||
      lowerType.includes("decimal") ||
      lowerType.includes("float") ||
      lowerType.includes("double")
    ) {
      const numValue = Number(value)
      return isNaN(numValue) ? "NULL" : numValue.toString()
    }

    if (lowerType.includes("bool")) {
      const boolValue = String(value).toLowerCase()
      if (["true", "1", "yes", "y"].includes(boolValue)) return "TRUE"
      if (["false", "0", "no", "n"].includes(boolValue)) return "FALSE"
      return "NULL"
    }

    if (lowerType.includes("date") || lowerType.includes("time")) {
      if (!isNaN(Date.parse(value))) {
        const date = new Date(value)
        if (lowerType.includes("date") && !lowerType.includes("time")) {
          return `'${date.toISOString().split("T")[0]}'`
        }
        return `'${date.toISOString()}'`
      }
      return "NULL"
    }

    // Default to string
    const escaped = String(value).replace(/'/g, "''")
    return `'${escaped}'`
  }

  private static createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = []
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize))
    }
    return batches
  }

  private static quoteIdentifier(identifier: string, dialect: string): string {
    switch (dialect) {
      case "mysql":
        return `\`${identifier}\``
      case "postgresql":
        return `"${identifier}"`
      case "sqlite":
        return `"${identifier}"`
      case "mssql":
        return `[${identifier}]`
      default:
        return identifier
    }
  }

  private static mapDataType(type: string, dialect: string): string {
    const lowerType = type.toLowerCase()

    // Common mappings between dialects
    const mappings: { [key: string]: { [dialect: string]: string } } = {
      int: {
        mysql: "INT",
        postgresql: "INTEGER",
        sqlite: "INTEGER",
        mssql: "INT",
      },
      varchar: {
        mysql: type, // Keep original with length
        postgresql: type,
        sqlite: "TEXT",
        mssql: type,
      },
      text: {
        mysql: "TEXT",
        postgresql: "TEXT",
        sqlite: "TEXT",
        mssql: "NVARCHAR(MAX)",
      },
    }

    // Find matching type
    for (const [baseType, dialectMap] of Object.entries(mappings)) {
      if (lowerType.includes(baseType)) {
        return dialectMap[dialect] || type
      }
    }

    return type // Return original if no mapping found
  }

  private static getTransactionStart(dialect: string): string {
    switch (dialect) {
      case "mysql":
        return "START TRANSACTION;"
      case "postgresql":
      case "sqlite":
        return "BEGIN TRANSACTION;"
      case "mssql":
        return "BEGIN TRANSACTION;"
      default:
        return "BEGIN TRANSACTION;"
    }
  }

  private static getTransactionEnd(dialect: string): string {
    return "COMMIT;"
  }

  static exportSQL(sql: GeneratedSQL, filename = "generated-sql.sql"): void {
    const allStatements = [...sql.createStatements, "", "-- INSERT STATEMENTS", "", ...sql.insertStatements]

    const content = allStatements.join("\n")
    const blob = new Blob([content], { type: "text/sql" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
}
