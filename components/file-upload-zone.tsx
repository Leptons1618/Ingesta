"use client"

import type React from "react"

import { useCallback, useState } from "react"
import { Upload, FileSpreadsheet, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface FileUploadZoneProps {
  onFileUpload: (files: File[]) => void
}

export function FileUploadZone({ onFileUpload }: FileUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const validateFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const validExtensions = [".xlsx", ".xls"]
    const maxSize = 50 * 1024 * 1024 // 50MB

    const invalidFiles = fileArray.filter((file) => {
      const extension = file.name.toLowerCase().substring(file.name.lastIndexOf("."))
      return !validExtensions.includes(extension) || file.size > maxSize
    })

    if (invalidFiles.length > 0) {
      setUploadError(`Invalid files detected. Please upload Excel files (.xlsx, .xls) under 50MB.`)
      return []
    }

    setUploadError(null)
    return fileArray
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)

      const files = validateFiles(e.dataTransfer.files)
      if (files.length > 0) {
        onFileUpload(files)
      }
    },
    [validateFiles, onFileUpload],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const files = validateFiles(e.target.files)
        if (files.length > 0) {
          onFileUpload(files)
        }
      }
    },
    [validateFiles, onFileUpload],
  )

  const clearError = useCallback(() => {
    setUploadError(null)
  }, [])

  return (
    <div className="space-y-4">
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          multiple
          accept=".xlsx,.xls"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />

        <div className="flex flex-col items-center gap-4">
          <div className={`p-3 rounded-full ${isDragOver ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
            <Upload className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">
              {isDragOver ? "Drop files here" : "Upload Excel Files"}
            </h3>
            <p className="text-sm text-muted-foreground">Drag and drop your Excel files here, or click to browse</p>
            <p className="text-xs text-muted-foreground">Supports .xlsx and .xls files up to 50MB each</p>
          </div>

          <Button variant="outline" size="sm" className="mt-2 bg-transparent">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Choose Files
          </Button>
        </div>
      </div>

      {uploadError && (
        <Alert variant="destructive">
          <X className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            {uploadError}
            <Button variant="ghost" size="sm" onClick={clearError}>
              <X className="w-4 h-4" />
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
