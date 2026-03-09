"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileSpreadsheet, Eye, Database, ChevronRight } from "lucide-react"
import type { ExcelFile } from "@/lib/excel-parser"

interface ExcelPreviewProps {
  files: ExcelFile[]
  onProceedToMapping: () => void
}

export function ExcelPreview({ files, onProceedToMapping }: ExcelPreviewProps) {
  const [selectedFile, setSelectedFile] = useState(0)
  const [selectedSheet, setSelectedSheet] = useState(0)

  const currentFile = files[selectedFile]
  const currentSheet = currentFile?.sheets[selectedSheet]

  const totalSheets = files.reduce((sum, file) => sum + file.sheets.length, 0)
  const totalRows = files.reduce((sum, file) => sum + file.totalRows, 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="card-shell">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
              <div>
                <p className="text-2xl font-bold">{files.length}</p>
                <p className="text-xs text-muted-foreground">Files</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-shell">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              <div>
                <p className="text-2xl font-bold">{totalSheets}</p>
                <p className="text-xs text-muted-foreground">Sheets</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-shell">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              <div>
                <p className="text-2xl font-bold">{totalRows.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Rows</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-shell">
          <CardContent className="p-4 flex items-center justify-center">
            <Button onClick={onProceedToMapping} className="w-full">
              Proceed to Mapping
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="card-shell">
        <CardHeader>
          <CardTitle>Data Preview</CardTitle>
          <CardDescription>Review your Excel data before proceeding to field mapping</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={selectedFile.toString()}
            onValueChange={(value) => {
              setSelectedFile(Number.parseInt(value))
              setSelectedSheet(0)
            }}
          >
            <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0 md:grid-cols-2 lg:grid-cols-3">
              {files.map((file, index) => (
                <TabsTrigger key={index} value={index.toString()} className="justify-start border bg-card px-3 py-3 text-left shadow-none">
                  <div className="flex items-center gap-2 truncate">
                    <FileSpreadsheet className="w-4 h-4" />
                    <span className="truncate">{file.name}</span>
                    <Badge variant="secondary" className="ml-auto">
                      {file.sheets.length}
                    </Badge>
                  </div>
                </TabsTrigger>
              ))}
            </TabsList>

            {files.map((file, fileIndex) => (
              <TabsContent key={fileIndex} value={fileIndex.toString()} className="space-y-4">
                {/* Sheet Selection */}
                <div className="flex flex-wrap gap-2">
                  {file.sheets.map((sheet, sheetIndex) => (
                    <Button
                      key={sheetIndex}
                      variant={selectedSheet === sheetIndex ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedSheet(sheetIndex)}
                      className="rounded-full"
                    >
                      {sheet.name}
                      <Badge variant="secondary" className="ml-2">
                        {sheet.rowCount}
                      </Badge>
                    </Button>
                  ))}
                </div>

                {/* Data Table */}
                {currentSheet && (
                  <Card className="card-shell">
                    <CardHeader>
                      <CardTitle className="text-lg">{currentSheet.name}</CardTitle>
                      <CardDescription>
                        {currentSheet.rowCount} rows × {currentSheet.columnCount} columns
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="table-shell">
                        <ScrollArea className="h-96 w-full">
                          <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-12">#</TableHead>
                              {currentSheet.headers.map((header, index) => (
                                <TableHead key={index} className="min-w-32 font-semibold">
                                  {header}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {currentSheet.data.slice(0, 50).map((row, rowIndex) => (
                              <TableRow key={rowIndex}>
                                <TableCell className="font-mono text-xs text-muted-foreground">
                                  {rowIndex + 1}
                                </TableCell>
                                {row.map((cell, cellIndex) => (
                                  <TableCell key={cellIndex} className="max-w-48 truncate align-top">
                                    <span className="line-clamp-1">{cell?.toString() || ""}</span>
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                          </Table>
                        </ScrollArea>
                      </div>

                      {currentSheet.rowCount > 50 && (
                        <div className="mt-4 text-center">
                          <Badge variant="outline">Showing first 50 of {currentSheet.rowCount} rows</Badge>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
