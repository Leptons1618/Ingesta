"use client"

import { useState } from "react"
import { ChevronRight, FileSpreadsheet } from "lucide-react"

import { ChipButton, DataTable } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ExcelFile } from "@/lib/types"

const PREVIEW_ROW_LIMIT = 50

interface ExcelPreviewProps {
  files: ExcelFile[]
  onProceed: () => void
}

export function ExcelPreview({ files, onProceed }: ExcelPreviewProps) {
  const [selectedFile, setSelectedFile] = useState(0)
  const [selectedSheet, setSelectedSheet] = useState(0)

  const currentSheet = files[selectedFile]?.sheets[selectedSheet]

  const totalSheets = files.reduce((sum, file) => sum + file.sheets.length, 0)

  const selectFile = (index: number) => {
    setSelectedFile(index)
    setSelectedSheet(0)
  }

  return (
    <div className="space-y-6">
      <Card className="card-shell">
        <CardHeader>
          <CardTitle>Data preview</CardTitle>
          <CardDescription>Check the sheets in this batch before choosing a database for them.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedFile.toString()} onValueChange={(value) => selectFile(Number.parseInt(value))}>
            <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0 md:grid-cols-2 lg:grid-cols-3">
              {files.map((file, index) => (
                <TabsTrigger
                  key={`${file.name}-${index}`}
                  value={index.toString()}
                  className="justify-start border bg-card px-3 py-3 text-left shadow-none"
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileSpreadsheet className="h-4 w-4" />
                    <span className="truncate">{file.name}</span>
                    <Badge variant="secondary" className="ml-auto">
                      {file.sheets.length}
                    </Badge>
                  </div>
                </TabsTrigger>
              ))}
            </TabsList>

            {files.map((file, fileIndex) => (
              <TabsContent key={`${file.name}-${fileIndex}`} value={fileIndex.toString()} className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {file.sheets.map((sheet, sheetIndex) => (
                    <ChipButton
                      key={sheet.name}
                      selected={selectedSheet === sheetIndex}
                      onClick={() => setSelectedSheet(sheetIndex)}
                    >
                      {sheet.name}
                      <Badge variant="secondary" className="ml-2">
                        {sheet.data.length}
                      </Badge>
                    </ChipButton>
                  ))}
                </div>

                {currentSheet ? (
                  <Card className="card-shell">
                    <CardHeader>
                      <CardTitle className="text-lg">{currentSheet.name}</CardTitle>
                      <CardDescription>
                        {currentSheet.data.length.toLocaleString()} rows x {currentSheet.headers.length} columns
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <DataTable
                        columns={currentSheet.headers}
                        rows={currentSheet.data.slice(0, PREVIEW_ROW_LIMIT)}
                        showRowNumbers
                      />

                      {currentSheet.data.length > PREVIEW_ROW_LIMIT ? (
                        <div className="text-center">
                          <Badge variant="outline">
                            Showing first {PREVIEW_ROW_LIMIT} of {currentSheet.data.length.toLocaleString()} rows
                          </Badge>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ) : null}
              </TabsContent>
            ))}
          </Tabs>

          <div className="mt-6 flex justify-end">
            <Button onClick={onProceed}>
              Choose a database
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
