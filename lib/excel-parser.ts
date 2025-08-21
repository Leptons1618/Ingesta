import * as XLSX from "xlsx"

export interface ExcelSheet {
  name: string
  data: any[][]
  headers: string[]
  rowCount: number
  columnCount: number
}

export interface ExcelFile {
  name: string
  sheets: ExcelSheet[]
  totalRows: number
  size: number
}

export interface ParsedData {
  files: ExcelFile[]
  totalSheets: number
  totalRows: number
  errors: string[]
}

export class ExcelParser {
  static async parseFiles(files: File[]): Promise<ParsedData> {
    const parsedFiles: ExcelFile[] = []
    const errors: string[] = []
    let totalSheets = 0
    let totalRows = 0

    for (const file of files) {
      try {
        const parsedFile = await this.parseFile(file)
        parsedFiles.push(parsedFile)
        totalSheets += parsedFile.sheets.length
        totalRows += parsedFile.totalRows
      } catch (error) {
        errors.push(`Error parsing ${file.name}: ${error instanceof Error ? error.message : "Unknown error"}`)
      }
    }

    return {
      files: parsedFiles,
      totalSheets,
      totalRows,
      errors,
    }
  }

  private static async parseFile(file: File): Promise<ExcelFile> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: "array" })

          const sheets: ExcelSheet[] = []
          let fileTotalRows = 0

          workbook.SheetNames.forEach((sheetName) => {
            const worksheet = workbook.Sheets[sheetName]
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

            // Filter out empty rows
            const filteredData = jsonData.filter((row) =>
              row.some((cell) => cell !== null && cell !== undefined && cell !== ""),
            )

            if (filteredData.length > 0) {
              const headers = filteredData[0]?.map((header, index) => header?.toString() || `Column ${index + 1}`) || []

              const dataRows = filteredData.slice(1)

              sheets.push({
                name: sheetName,
                data: dataRows,
                headers,
                rowCount: dataRows.length,
                columnCount: headers.length,
              })

              fileTotalRows += dataRows.length
            }
          })

          resolve({
            name: file.name,
            sheets,
            totalRows: fileTotalRows,
            size: file.size,
          })
        } catch (error) {
          reject(error)
        }
      }

      reader.onerror = () => reject(new Error("Failed to read file"))
      reader.readAsArrayBuffer(file)
    })
  }

  static detectDataTypes(data: any[][]): { [column: string]: string } {
    if (data.length === 0) return {}

    const types: { [column: string]: string } = {}
    const sampleSize = Math.min(10, data.length)

    // Analyze first few rows to detect data types
    for (let colIndex = 0; colIndex < (data[0]?.length || 0); colIndex++) {
      const columnName = `Column ${colIndex + 1}`
      const samples = data.slice(0, sampleSize).map((row) => row[colIndex])

      let isNumber = true
      let isDate = true
      let isBoolean = true

      for (const sample of samples) {
        if (sample === null || sample === undefined || sample === "") continue

        if (isNumber && isNaN(Number(sample))) {
          isNumber = false
        }

        if (isDate && isNaN(Date.parse(sample))) {
          isDate = false
        }

        if (isBoolean && !["true", "false", "1", "0", "yes", "no"].includes(String(sample).toLowerCase())) {
          isBoolean = false
        }
      }

      if (isNumber) {
        types[columnName] = "NUMBER"
      } else if (isDate) {
        types[columnName] = "DATE"
      } else if (isBoolean) {
        types[columnName] = "BOOLEAN"
      } else {
        types[columnName] = "TEXT"
      }
    }

    return types
  }
}
