"use client"

import { useRef, useState } from "react"
import { Copy, Ellipsis, FileSpreadsheet, Pencil, Scissors, Trash2 } from "lucide-react"

import { LoadingCard, Section } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { DatasetSummary, RetentionPolicy } from "@/lib/types"
import { cn, formatBytes, formatRelativeTime } from "@/lib/utils"

/**
 * The dataset column.
 *
 * Every list action is a callback rather than a direct `Workspace` call: the
 * page owns the workspace, so a delete here can be gated by the same
 * confirmation dialog as every other destructive action.
 */
export function DatasetList({
  datasets,
  selectedId,
  retention,
  loading,
  busy,
  onSelect,
  onImport,
  onRename,
  onDuplicate,
  onDelete,
  onPrune,
  onClearAll,
}: {
  datasets: DatasetSummary[]
  selectedId: string | null
  retention: RetentionPolicy
  loading: boolean
  busy: boolean
  onSelect: (id: string) => void
  onImport: (files: File[]) => void
  onRename: (id: string, name: string) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onPrune: () => void
  onClearAll: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [renaming, setRenaming] = useState<DatasetSummary | null>(null)
  const [renameValue, setRenameValue] = useState("")

  const totalRows = datasets.reduce((total, dataset) => total + dataset.rowCount, 0)
  const totalBytes = datasets.reduce((total, dataset) => total + dataset.bytes, 0)

  const retentionNote =
    retention.datasetTtlDays > 0
      ? `Keeps at most ${retention.maxDatasets} datasets, and prunes any left untouched for ${retention.datasetTtlDays} days.`
      : `Keeps at most ${retention.maxDatasets} datasets.`

  const commitRename = () => {
    if (!renaming) return
    const name = renameValue.trim()
    if (name && name !== renaming.name) onRename(renaming.id, name)
    setRenaming(null)
  }

  return (
    <Section
      title="Datasets"
      description={
        datasets.length === 0
          ? "Nothing stored in this browser yet."
          : `${datasets.length} stored · ${totalRows.toLocaleString()} rows · ${formatBytes(totalBytes)}`
      }
    >
      <div className="space-y-3">
        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            if (event.dataTransfer.files.length > 0) onImport(Array.from(event.dataTransfer.files))
          }}
          className={cn(
            "rounded-xl border border-dashed p-4 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border",
          )}
        >
          <FileSpreadsheet className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">Drop a workbook or CSV here</p>
          <p className="text-xs text-muted-foreground">.xlsx, .xls and .csv · one dataset per sheet</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            accept=".xlsx,.xls,.csv"
            onChange={(event) => {
              if (event.target.files && event.target.files.length > 0) onImport(Array.from(event.target.files))
              // Clearing the value lets the same file be chosen again.
              event.target.value = ""
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            loading={busy}
            onClick={() => inputRef.current?.click()}
          >
            Choose files
          </Button>
        </div>

        {loading ? (
          <LoadingCard label="Reading the workspace" />
        ) : datasets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No datasets yet. A parsed sheet lands here and stays in this browser.
          </p>
        ) : (
          <div className="space-y-2">
            {datasets.map((dataset) => (
              <div
                key={dataset.id}
                className={cn(
                  "flex items-start gap-1 rounded-xl border p-3 transition-colors",
                  dataset.id === selectedId ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(dataset.id)}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{dataset.name}</span>
                    {dataset.operationCount > 0 ? (
                      <Badge variant="outline">{dataset.operationCount} ops</Badge>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {dataset.sourceFile} · sheet “{dataset.sheetName}”
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    <span>{dataset.rowCount.toLocaleString()} rows</span>
                    <span aria-hidden>·</span>
                    <span>{dataset.columnCount} cols</span>
                    <span aria-hidden>·</span>
                    <span>{formatBytes(dataset.bytes)}</span>
                    <span aria-hidden>·</span>
                    <span>{formatRelativeTime(dataset.updatedAt)}</span>
                  </span>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Actions for ${dataset.name}`}
                      className="size-7 shrink-0 text-muted-foreground"
                    >
                      <Ellipsis className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      onSelect={() => {
                        setRenaming(dataset)
                        setRenameValue(dataset.name)
                      }}
                    >
                      <Pencil className="size-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={busy} onSelect={() => onDuplicate(dataset.id)}>
                      <Copy className="size-4" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" disabled={busy} onSelect={() => onDelete(dataset.id)}>
                      <Trash2 className="size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 border-t pt-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={onPrune}>
              <Scissors className="size-3.5" />
              Prune now
            </Button>
            <Button variant="ghost" size="sm" disabled={busy || datasets.length === 0} onClick={onClearAll}>
              <Trash2 className="size-3.5" />
              Clear all
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{retentionNote}</p>
        </div>
      </div>

      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename dataset</DialogTitle>
            <DialogDescription>
              Only the name changes — the parsed rows and every operation stay as they are.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dataset-name">Name</Label>
            <Input
              id="dataset-name"
              value={renameValue}
              autoFocus
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitRename()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button disabled={renameValue.trim().length === 0} onClick={commitRename}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  )
}
