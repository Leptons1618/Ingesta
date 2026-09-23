"use client"

import { useMemo, useState } from "react"
import { ChevronRight, FileSpreadsheet } from "lucide-react"

import { DataTable, EmptyState } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ExcelFile, ExcelSheet } from "@/lib/types"
import { cn, formatBytes } from "@/lib/utils"

const PREVIEW_ROW_LIMIT = 50

/**
 * A sheet wider than the viewport scrolls sideways, so the header row and the
 * row-number gutter stay put: a line of values without labels is unreadable,
 * and the gutter is how a row is referenced. Three details are load-bearing —
 * the header keeps its own z-index from the app's sticky-header rule, so the
 * pinned gutter sits at 1 underneath it; the corner cell has to outrank its
 * header siblings with an important flag for the same reason; and the pinned
 * cells need an opaque background that repeats the zebra striping, because the
 * grid's hover and stripe layers would otherwise paint through them.
 */
const PINNED_GRID = cn(
  "[&_[data-slot=table-head]]:sticky [&_[data-slot=table-head]]:top-0 [&_[data-slot=table-head]]:z-20",
  "[&_[data-slot=table-head]:first-child]:left-0 [&_[data-slot=table-head]:first-child]:z-30!",
  "[&_[data-slot=table-body]_tr:not([aria-hidden])_td:first-child]:sticky",
  "[&_[data-slot=table-body]_tr:not([aria-hidden])_td:first-child]:left-0",
  "[&_[data-slot=table-body]_tr:not([aria-hidden])_td:first-child]:z-1",
  "[&_[data-slot=table-body]_tr:not([aria-hidden])_td:first-child]:select-none",
  "[&_[data-slot=table-body]_tr:nth-child(odd)_td:first-child]:bg-card!",
  "[html[data-zebra-rows=true]_&_[data-slot=table-body]_tr:nth-child(even)_td:first-child]:bg-[color-mix(in_oklab,var(--muted)_55%,var(--card))]!",
)

interface ExcelPreviewProps {
  files: ExcelFile[]
  onProceed: () => void
}

/** "3 sheets" / "1 file" — counts read as a sentence, so they need no badge. */
function countLabel(count: number, noun: string) {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`
}

function shapeLabel(sheet: ExcelSheet) {
  return `${countLabel(sheet.data.length, "row")} × ${countLabel(sheet.headers.length, "column")}`
}

function previewCaption(sheet: ExcelSheet, shown: number) {
  const columns = countLabel(sheet.headers.length, "column")
  if (sheet.data.length === 0) return `No rows in this sheet · ${columns}`
  if (sheet.data.length > shown) {
    return `Showing the first ${shown.toLocaleString()} of ${sheet.data.length.toLocaleString()} rows · ${columns}`
  }
  return `Showing all ${shown.toLocaleString()} rows · ${columns}`
}

export function ExcelPreview({ files, onProceed }: ExcelPreviewProps) {
  const [selectedFile, setSelectedFile] = useState(0)
  const [selectedSheet, setSelectedSheet] = useState(0)

  const currentFile = files[selectedFile]
  const currentSheet = currentFile?.sheets[selectedSheet]

  // A blank cell from the workbook arrives as an empty string and paints as
  // nothing at all; `null` is what the grid renders as a muted em dash.
  const previewRows = useMemo(
    () =>
      (currentSheet?.data.slice(0, PREVIEW_ROW_LIMIT) ?? []).map((row) =>
        row.map((cell) => (cell === "" ? null : cell)),
      ),
    [currentSheet],
  )

  const totalSheets = files.reduce((sum, file) => sum + file.sheets.length, 0)

  const selectFile = (index: number) => {
    setSelectedFile(index)
    setSelectedSheet(0)
  }

  if (files.length === 0) {
    return (
      <EmptyState
        icon={<FileSpreadsheet />}
        title="No workbooks to preview"
        description="Upload at least one .xlsx file and analyze it to see its sheets here."
      />
    )
  }

  return (
    <div className="space-y-6">
      <Card className="card-shell">
        <CardHeader>
          <CardTitle>Data preview</CardTitle>
          <CardDescription>Check the sheets in this batch before choosing a database for them.</CardDescription>
          <CardAction>
            <Badge variant="outline">
              {countLabel(files.length, "file")} · {countLabel(totalSheets, "sheet")}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <div className="space-y-5">
              <section className="space-y-2">
                <p className="text-xs tracking-wide text-muted-foreground uppercase">Files</p>
                <ul className="space-y-1">
                  {files.map((file, index) => {
                    const active = index === selectedFile

                    return (
                      <li key={`${file.name}-${index}`}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => selectFile(index)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg border border-l-2 border-transparent py-2 pr-3 pl-2.5 text-left transition-colors",
                            active ? "border-l-primary bg-muted/60" : "hover:bg-muted/40",
                          )}
                        >
                          <FileSpreadsheet
                            aria-hidden
                            className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")}
                          />
                          <span className="min-w-0 flex-1">
                            <span className={cn("block truncate text-sm", active && "font-medium")}>{file.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {countLabel(file.sheets.length, "sheet")} · {formatBytes(file.size)}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>

              <section className="space-y-2">
                <p className="text-xs tracking-wide text-muted-foreground uppercase">Sheets</p>
                <ul className="space-y-1">
                  {currentFile?.sheets.map((sheet, index) => {
                    const active = index === selectedSheet

                    return (
                      <li key={`${sheet.name}-${index}`}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => setSelectedSheet(index)}
                          className={cn(
                            "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                            active ? "bg-primary/10" : "hover:bg-muted/50",
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className={cn("block truncate text-sm", active && "font-medium")}>{sheet.name}</span>
                            <span className="block text-xs text-muted-foreground">{shapeLabel(sheet)}</span>
                          </span>
                          <ChevronRight
                            aria-hidden
                            className={cn(
                              "size-4 shrink-0 transition-transform",
                              active ? "text-primary" : "text-muted-foreground/60 group-hover:translate-x-0.5",
                            )}
                          />
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {currentFile && currentFile.sheets.length === 0 ? (
                  <p className="px-3 text-sm text-muted-foreground">This workbook holds no readable sheets.</p>
                ) : null}
              </section>
            </div>

            <div className="min-w-0 space-y-3">
              {currentSheet ? (
                <>
                  <div className="space-y-0.5">
                    <h3 className="truncate text-sm font-semibold">{currentSheet.name}</h3>
                    <p className="text-xs text-muted-foreground">{previewCaption(currentSheet, previewRows.length)}</p>
                  </div>
                  <div className={PINNED_GRID}>
                    <DataTable
                      columns={currentSheet.headers}
                      rows={previewRows}
                      showRowNumbers
                      className="h-[26rem]"
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Pick a sheet to preview its rows.</p>
              )}
            </div>
          </div>

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
