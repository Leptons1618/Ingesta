"use client"

import type React from "react"

import { useState } from "react"
import { Upload } from "lucide-react"

import { StatusAlert } from "@/components/common"
import { formatBytes } from "@/lib/utils"

const MAX_FILE_SIZE = 50 * 1024 * 1024
const VALID_EXTENSIONS = [".xlsx", ".xls"]

interface FileUploadZoneProps {
  onFileUpload: (files: File[]) => void
}

export function FileUploadZone({ onFileUpload }: FileUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const acceptFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return

    const outcomes = Array.from(fileList).map((file) => {
      const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."))

      if (!VALID_EXTENSIONS.includes(extension)) return { file, reason: `${file.name} is not an Excel file.` }
      if (file.size > MAX_FILE_SIZE) return { file, reason: `${file.name} is ${formatBytes(file.size)}.` }
      return { file, reason: "" }
    })

    const rejected = outcomes.filter((outcome) => outcome.reason !== "")

    if (rejected.length > 0) {
      setUploadError(
        `${rejected.map((outcome) => outcome.reason).join(" ")} Upload .xlsx or .xls files under 50MB.`,
      )
      return
    }

    setUploadError(null)
    onFileUpload(outcomes.map((outcome) => outcome.file))
  }

  return (
    <div className="space-y-4">
      <div
        className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50"
        }`}
        onDragOver={(event: React.DragEvent) => {
          event.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={(event: React.DragEvent) => {
          event.preventDefault()
          setIsDragOver(false)
        }}
        onDrop={(event: React.DragEvent) => {
          event.preventDefault()
          setIsDragOver(false)
          acceptFiles(event.dataTransfer.files)
        }}
      >
        <input
          type="file"
          multiple
          accept=".xlsx,.xls"
          aria-label="Upload Excel files"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => acceptFiles(event.target.files)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />

        <div className="flex flex-col items-center gap-4">
          <div className={`rounded-full p-3 ${isDragOver ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
            <Upload className="h-8 w-8" />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">
              {isDragOver ? "Drop files here" : "Upload Excel files"}
            </h3>
            <p className="text-sm text-muted-foreground">Drag and drop your Excel files here, or click to browse</p>
            <p className="text-xs text-muted-foreground">
              Supports .xlsx and .xls files up to {formatBytes(MAX_FILE_SIZE)} each
            </p>
          </div>
        </div>
      </div>

      {uploadError ? <StatusAlert tone="error">{uploadError}</StatusAlert> : null}
    </div>
  )
}
