"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Play, Settings2, Terminal } from "lucide-react"

import { DataGrid, StatusAlert } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { analyseSql, assessSql } from "@/lib/guardrails"
import { useAppSettingsStore } from "@/lib/settings"
import { toast } from "@/lib/toast"
import type { DatabaseConfig, GridColumn, QueryResult } from "@/lib/types"

import { AssessmentNote } from "./guardrail-gate"

interface QueryConsoleProps {
  connection: DatabaseConfig
  /** A statement that ran is proof the profile works. */
  onUsed: (id: string) => void
}

/** Results only ever carry header labels, so every column is free text. */
function resultColumns(columns: string[]): GridColumn[] {
  return columns.map((name) => ({ name, type: "TEXT", nullable: true }))
}

/**
 * The console shows the guardrail verdict before the statement runs, and the
 * verdict is the only thing that can disable Run — write access included, which
 * stays a Settings decision so this panel never grows a second switch for it.
 */
export function QueryConsole({ connection, onUsed }: QueryConsoleProps) {
  const allowWriteSql = useAppSettingsStore((state) => state.guardrails.allowWriteSql)
  const maxRows = useAppSettingsStore((state) => state.guardrails.maxRowsPerPage)

  const [sql, setSql] = useState("")
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<QueryResult | null>(null)

  const analysis = useMemo(() => analyseSql(sql), [sql])
  const assessment = useMemo(() => assessSql(sql, { allowWrite: allowWriteSql }), [sql, allowWriteSql])
  const blockedReason = analysis.blockedReason

  /**
   * Write statements are refused by the setting, not by an error from the
   * server, so Run is blocked here for the same reason `blockedReason` blocks
   * it: the app already knows the answer.
   */
  const writeLocked = !blockedReason && !analysis.readOnly && !allowWriteSql
  const canRun = sql.trim().length > 0 && !blockedReason && !writeLocked && !running

  const handleRun = async () => {
    setRunning(true)
    const response = await api.runQuery(connection, sql, { maxRows, allowWrite: allowWriteSql })
    setRunning(false)

    if (!response.ok) {
      toast.error("The statement failed", response.error)
      return
    }

    setResult(response.data)
    onUsed(connection.id)
    toast.success(
      "Statement finished",
      `${response.data.data.length} row${response.data.data.length === 1 ? "" : "s"} in ${response.data.durationMs} ms${
        response.data.truncated ? " (more rows were not fetched)" : ""
      }`,
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Terminal className="size-4" />
            SQL console
          </p>
          <p className="text-xs text-muted-foreground">
            One statement at a time, run against {connection.database}. At most {maxRows} rows come back.
          </p>
        </div>
        <Badge variant={allowWriteSql ? "default" : "outline"} className="text-xs">
          {allowWriteSql ? "Write access on" : "Read-only"}
        </Badge>
      </div>

      <textarea
        value={sql}
        onChange={(event) => setSql(event.target.value)}
        spellCheck={false}
        rows={6}
        placeholder={"SELECT * FROM your_table LIMIT 50"}
        aria-label="SQL statement"
        className="border-input flex w-full min-w-0 resize-y rounded-md border bg-transparent px-3 py-2 font-mono text-sm shadow-xs transition-[color,box-shadow,border-color] duration-150 outline-none placeholder:text-muted-foreground hover:border-ring/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      />

      <AssessmentNote assessment={assessment} blockedReason={blockedReason} />

      {writeLocked ? (
        <StatusAlert tone="warning">
          Write access is off in Settings, so statements that change the database cannot run.{" "}
          <Link href="/settings" className="inline-flex items-center gap-1 font-medium underline underline-offset-4">
            <Settings2 className="size-3.5" />
            Open Settings
          </Link>
        </StatusAlert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button loading={running} disabled={!canRun} onClick={() => void handleRun()}>
          {running ? null : <Play />}
          Run statement
        </Button>
        <Button
          variant="ghost"
          disabled={running || (sql.length === 0 && result === null)}
          onClick={() => {
            setSql("")
            setResult(null)
          }}
        >
          Clear
        </Button>

        {result ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {result.data.length.toLocaleString()} rows · {result.durationMs} ms
            {result.truncated ? " · the result was truncated at the row cap" : ""}
          </span>
        ) : null}
      </div>

      {result ? (
        result.columns.length === 0 ? (
          <StatusAlert tone="success">The statement changed the database and returned no rows.</StatusAlert>
        ) : (
          <>
            <DataGrid
              columns={resultColumns(result.columns)}
              rows={result.data}
              editable={false}
              rowNumbers
              height={420}
              emptyMessage="The statement returned no rows."
            />
            {result.truncated ? (
              <StatusAlert tone="warning">
                The engine returned more rows than the {maxRows}-row cap, so only the first {result.data.length} are
                shown.
              </StatusAlert>
            ) : null}
          </>
        )
      ) : null}
    </div>
  )
}
