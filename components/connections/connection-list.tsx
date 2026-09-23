"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import type { ChangeEvent } from "react"
import {
  Copy,
  Database,
  Download,
  Ellipsis,
  KeyRound,
  Pencil,
  PlugZap,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import { ConnectionStorage, downloadFile } from "@/lib/storage"
import { toast } from "@/lib/toast"
import type { ConnectionTestResult, DatabaseConfig, GuardrailAssessment } from "@/lib/types"
import { cn, errorMessage, formatRelativeTime } from "@/lib/utils"

import { useGuardrailConfirm } from "./guardrail-gate"

/**
 * Removing a profile or replacing the whole list is destruction this app owns,
 * not the database's, so `lib/guardrails.ts` has no verdict for either — that
 * module judges server-side risk. These two say exactly what is lost, which is
 * the whole job of an assessment.
 */
function assessRemoveProfile(connection: DatabaseConfig): GuardrailAssessment {
  return {
    risk: "caution",
    title: `Remove the saved profile "${connection.name}"`,
    summary: "The profile is deleted from this browser. The database on the server is not touched.",
    warnings: [
      "The password stored with it is not recoverable from this app.",
      "The import wizard's connection picker will no longer offer it.",
    ],
  }
}

function assessReplaceProfiles(count: number): GuardrailAssessment {
  return {
    risk: "destructive",
    title: "Replace every saved connection",
    summary: `Replace mode discards all ${count} saved profile${count === 1 ? "" : "s"} before importing the ones in the file.`,
    warnings: ["A discarded password only comes back if the imported file was exported with passwords."],
    confirmation: "REPLACE",
  }
}

interface ConnectionListProps {
  connections: DatabaseConfig[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onEdit: (connection: DatabaseConfig) => void
  /** Every mutation ends here: the page re-reads storage and re-renders. */
  onChanged: () => void
}

/** Left column: every saved profile, with the actions that only apply to one. */
export function ConnectionList({ connections, selectedId, onSelect, onNew, onEdit, onChanged }: ConnectionListProps) {
  const [query, setQuery] = useState("")
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, ConnectionTestResult>>({})
  const fileInput = useRef<HTMLInputElement>(null)
  const importMode = useRef<"merge" | "replace">("merge")
  const { ask, gate } = useGuardrailConfirm()

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return connections
    return connections.filter((connection) =>
      [connection.name, connection.database, connection.host, connection.type, connection.group]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle)),
    )
  }, [connections, query])

  const applyImport = useCallback(
    (text: string, mode: "merge" | "replace") => {
      try {
        const summary = ConnectionStorage.importJson(text, mode)
        onChanged()
        toast.success("Connections imported", `${summary.added} added, ${summary.updated} updated, ${summary.removed} removed.`)
      } catch (error) {
        toast.error("That file could not be imported", errorMessage(error))
      }
    },
    [onChanged],
  )

  const handleTest = useCallback(
    async (connection: DatabaseConfig) => {
      setTestingId(connection.id)
      const result = await api.testConnection(connection)
      setTestingId(null)

      if (!result.ok) {
        toast.error(`Could not reach "${connection.name}"`, result.error)
        return
      }

      setTestResults((previous) => ({ ...previous, [connection.id]: result.data }))

      if (!result.data.success) {
        toast.error(`"${connection.name}" refused the connection`, result.data.message)
        return
      }

      const details = result.data.details
      toast.success(
        `"${connection.name}" is reachable`,
        [
          details?.serverVersion ?? "version not reported",
          details?.databaseName ?? connection.database,
          details?.tablesCount === undefined ? "table count not reported" : `${details.tablesCount} tables`,
        ].join(" · "),
      )

      ConnectionStorage.markUsed(connection.id)
      onChanged()
    },
    [onChanged],
  )

  const handleExport = useCallback((includeSecrets: boolean) => {
    const stamp = new Date().toISOString().slice(0, 10)
    const suffix = includeSecrets ? "with-passwords" : "no-passwords"
    downloadFile(
      `ingesta-connections-${suffix}-${stamp}.json`,
      ConnectionStorage.exportJson({ includeSecrets }),
      "application/json",
    )

    if (includeSecrets) {
      toast.warning("Passwords are in that file", "It holds every password in plain text. Store it accordingly.")
      return
    }

    toast.success("Connections exported", "Passwords were stripped from the file.")
  }, [])

  /** The file is read first so replace mode can be gated with the real text in hand. */
  const handleFileChosen = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      // The input is reused, so it is cleared before the work starts.
      event.target.value = ""
      if (!file) return

      const mode = importMode.current
      const reader = new FileReader()
      reader.onerror = () => toast.error("Could not read that file", `${file.name} could not be read.`)
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : ""
        if (mode === "merge") {
          applyImport(text, "merge")
          return
        }

        ask({
          assessment: assessReplaceProfiles(connections.length),
          confirmLabel: "Replace and import",
          run: () => applyImport(text, "replace"),
        })
      }
      reader.readAsText(file)
    },
    [applyImport, ask, connections.length],
  )

  const startImport = (mode: "merge" | "replace") => {
    importMode.current = mode
    fileInput.current?.click()
  }

  return (
    <Card className="card-shell">
      <CardHeader>
        <CardTitle className="text-base">Saved connections</CardTitle>
        <CardDescription>Profiles kept in this browser. Passwords never leave the device.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onNew}>
            <Plus />
            New
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <Upload />
                Import
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>Import a backup</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => startImport("merge")}>
                <Upload />
                Merge with saved profiles
                <DropdownMenuShortcut>safe</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => startImport("replace")}>
                <Trash2 />
                Replace every saved profile
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={connections.length === 0}>
                <Download />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <DropdownMenuLabel>Export connections</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => handleExport(false)}>
                <Download />
                Without passwords
                <DropdownMenuShortcut>safer</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => handleExport(true)}>
                <KeyRound />
                With passwords
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <p className="px-2 pb-1.5 text-xs text-muted-foreground">
                A backup with passwords writes every password into the file as plain text.
              </p>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="text-xs text-muted-foreground">
          Backups are plain JSON. Choose “without passwords” unless the file is stored somewhere safe.
        </p>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, database or host"
            aria-label="Search connections"
            className="pl-8"
          />
        </div>

        {visible.length === 0 ? (
          connections.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-8 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                <Database className="size-5" />
              </span>
              <div className="space-y-1">
                <p className="font-semibold">No saved connections</p>
                <p className="text-sm text-muted-foreground">
                  Add a connection with the form, then explore its tables, run queries and manage snapshots from here.
                </p>
              </div>
              <Button size="sm" onClick={onNew}>
                <Plus />
                Add connection
              </Button>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No saved connection matches “{query}”.
            </p>
          )
        ) : (
          <ul className="space-y-2">
            {visible.map((connection) => {
              const result = testResults[connection.id]
              const selected = connection.id === selectedId

              return (
                <li
                  key={connection.id}
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
                    selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => onSelect(connection.id)}
                      aria-current={selected}
                      className="min-w-0 flex-1 cursor-pointer text-left"
                    >
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{connection.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {connection.type.toUpperCase()}
                        </Badge>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {connection.host ? `${connection.host}:${connection.port ?? ""} · ` : ""}
                        {connection.database}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {connection.lastUsedAt ? `Last used ${formatRelativeTime(connection.lastUsedAt)}` : "Never opened"}
                      </span>
                    </button>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      aria-label={connection.favorite ? `Unpin ${connection.name}` : `Pin ${connection.name}`}
                      aria-pressed={Boolean(connection.favorite)}
                      onClick={() => {
                        ConnectionStorage.toggleFavorite(connection.id)
                        onChanged()
                      }}
                    >
                      <Star className={cn(connection.favorite && "fill-current text-amber-500")} />
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          aria-label={`Actions for ${connection.name}`}
                        >
                          <Ellipsis />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={testingId === connection.id}
                          onSelect={() => void handleTest(connection)}
                        >
                          <PlugZap />
                          {testingId === connection.id ? "Testing…" : "Test connection"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onEdit(connection)}>
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            const copy = ConnectionStorage.duplicate(connection.id)
                            onChanged()
                            if (copy) toast.success(`Duplicated as "${copy.name}"`, "The copy keeps the same credentials.")
                            else toast.error("Could not duplicate that connection")
                          }}
                        >
                          <Copy />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() =>
                            ask({
                              assessment: assessRemoveProfile(connection),
                              confirmLabel: "Remove profile",
                              run: () => {
                                ConnectionStorage.remove(connection.id)
                                onChanged()
                                toast.success(`"${connection.name}" removed`, "Only the saved profile was deleted.")
                              },
                            })
                          }
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {result ? (
                    <p className={cn("mt-2 text-xs", result.success ? "text-muted-foreground" : "text-destructive")}>
                      {result.success
                        ? [
                            result.details?.serverVersion ?? "version not reported",
                            result.details?.databaseName ?? connection.database,
                            result.details?.tablesCount === undefined
                              ? "table count not reported"
                              : `${result.details.tablesCount} tables`,
                          ].join(" · ")
                        : result.message}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}

        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileChosen}
        />
      </CardContent>

      {gate}
    </Card>
  )
}
