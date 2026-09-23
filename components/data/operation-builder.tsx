"use client"

import { useMemo, useState } from "react"
import { Plus } from "lucide-react"

import { ExpressionField } from "@/components/expression-field"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { COLUMN_TYPE_OPTIONS } from "@/lib/schema"
import type { DataOperation, FillStrategy, Grid, OperationKind, SortDirection } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Every operation the engine can apply, with the sentence that explains it. */
const KINDS: Array<{ value: OperationKind; label: string; hint: string }> = [
  { value: "filter", label: "Filter rows", hint: "Keep only the rows where the expression is true." },
  { value: "derive", label: "Add a column", hint: "Compute a new column from the existing ones." },
  { value: "rename", label: "Rename a column", hint: "Give a column a clearer name." },
  { value: "drop", label: "Remove columns", hint: "Delete columns you do not need." },
  { value: "keep", label: "Keep columns", hint: "Delete everything except the columns you pick." },
  { value: "reorder", label: "Reorder columns", hint: "Choose the order columns appear in." },
  { value: "cast", label: "Change a column type", hint: "Convert every value in a column to another type." },
  { value: "fill", label: "Fill blanks", hint: "Replace empty cells with a value or a statistic." },
  { value: "dedupe", label: "Remove duplicates", hint: "Keep the first row for each key." },
  { value: "sort", label: "Sort rows", hint: "Order rows by one column." },
  { value: "trim", label: "Trim whitespace", hint: "Strip leading and trailing spaces." },
  { value: "replace", label: "Find and replace", hint: "Replace text inside one column." },
  { value: "limit", label: "Keep the first rows", hint: "Truncate the grid to the first N rows." },
]

const FILL_STRATEGIES: Array<{ value: FillStrategy; label: string }> = [
  { value: "value", label: "A fixed value" },
  { value: "mean", label: "Column average" },
  { value: "median", label: "Column median" },
  { value: "mode", label: "Most common value" },
  { value: "forward", label: "Previous value" },
  { value: "backward", label: "Next value" },
]

const TYPE_GROUPS = [...new Set(COLUMN_TYPE_OPTIONS.map((option) => option.group))]

/**
 * Builds one operation and hands it to the caller. Every field is controlled
 * here so the caller only ever sees a complete, valid `DataOperation`.
 */
export function OperationBuilder({
  grid,
  onAdd,
  disabled,
}: {
  grid: Grid
  onAdd: (operation: DataOperation) => void
  disabled?: boolean
}) {
  const [kind, setKind] = useState<OperationKind>("filter")
  const columns = useMemo(() => grid.columns.map((column) => column.name), [grid.columns])

  const [expression, setExpression] = useState("")
  const [newColumn, setNewColumn] = useState("")
  const [newColumnType, setNewColumnType] = useState("VARCHAR(100)")
  const [fromColumn, setFromColumn] = useState(columns[0] ?? "")
  const [toColumn, setToColumn] = useState("")
  const [picked, setPicked] = useState<string[]>([])
  const [castType, setCastType] = useState("VARCHAR(100)")
  const [fillStrategy, setFillStrategy] = useState<FillStrategy>("value")
  const [fillValue, setFillValue] = useState("")
  const [direction, setDirection] = useState<SortDirection>("asc")
  const [find, setFind] = useState("")
  const [replacement, setReplacement] = useState("")
  const [useRegex, setUseRegex] = useState(false)
  const [limitCount, setLimitCount] = useState("1000")

  const togglePicked = (name: string) =>
    setPicked((current) => (current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name]))

  const operation = useMemo((): DataOperation | null => {
    switch (kind) {
      case "filter":
        return expression.trim() ? { kind: "filter", expression } : null
      case "derive":
        return expression.trim() && newColumn.trim() ? { kind: "derive", column: newColumn.trim(), type: newColumnType, expression } : null
      case "rename":
        return fromColumn && toColumn.trim() ? { kind: "rename", from: fromColumn, to: toColumn.trim() } : null
      case "drop":
        return picked.length > 0 ? { kind: "drop", columns: picked } : null
      case "keep":
        return picked.length > 0 ? { kind: "keep", columns: picked } : null
      case "reorder":
        return picked.length > 0 ? { kind: "reorder", columns: picked } : null
      case "cast":
        return fromColumn ? { kind: "cast", column: fromColumn, type: castType } : null
      case "fill":
        return fromColumn && (fillStrategy !== "value" || fillValue !== "") ? { kind: "fill", column: fromColumn, strategy: fillStrategy, value: fillValue } : null
      case "dedupe":
        return { kind: "dedupe", columns: picked }
      case "sort":
        return fromColumn ? { kind: "sort", column: fromColumn, direction } : null
      case "trim":
        return picked.length > 0 ? { kind: "trim", columns: picked } : null
      case "replace":
        return fromColumn && find !== "" ? { kind: "replace", column: fromColumn, find, replacement, regex: useRegex } : null
      case "limit": {
        const parsed = Number(limitCount)
        return Number.isFinite(parsed) && parsed > 0 ? { kind: "limit", count: Math.trunc(parsed) } : null
      }
    }
  }, [castType, direction, expression, fillStrategy, fillValue, find, fromColumn, kind, limitCount, newColumn, newColumnType, picked, replacement, toColumn, useRegex])

  const active = KINDS.find((entry) => entry.value === kind)!
  const usesColumnList = kind === "drop" || kind === "keep" || kind === "trim" || kind === "dedupe" || kind === "reorder"
  const usesSingleColumn = kind === "rename" || kind === "cast" || kind === "fill" || kind === "sort" || kind === "replace"

  const submit = () => {
    if (!operation) return
    onAdd(operation)
    // Keep the kind and column choice so a second, similar operation is quick.
    setPicked([])
    setExpression("")
    setNewColumn("")
    setToColumn("")
    setFind("")
    setReplacement("")
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Select value={kind} onValueChange={(value) => setKind(value as OperationKind)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{active.hint}</p>
      </div>

      {kind === "filter" ? (
        <ExpressionField value={expression} onChange={setExpression} columns={columns} label="Keep rows where" placeholder="amount > 100 AND region = 'EU'" />
      ) : null}

      {kind === "derive" ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              <label className="text-sm font-medium">New column name</label>
              <Input value={newColumn} onChange={(event) => setNewColumn(event.target.value)} placeholder="net_amount" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select value={newColumnType} onValueChange={setNewColumnType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_GROUPS.map((group) => (
                    <div key={group}>
                      <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group}</p>
                      {COLUMN_TYPE_OPTIONS.filter((option) => option.group === group).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <ExpressionField value={expression} onChange={setExpression} columns={columns} label="Value" placeholder="amount * 0.8" />
        </div>
      ) : null}

      {kind === "rename" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <ColumnSelect label="From" columns={columns} value={fromColumn} onChange={setFromColumn} />
          <div className="space-y-2">
            <label className="text-sm font-medium">To</label>
            <Input value={toColumn} onChange={(event) => setToColumn(event.target.value)} placeholder="new_name" />
          </div>
        </div>
      ) : null}

      {usesColumnList ? (
        <ColumnPicker columns={columns} picked={picked} onToggle={togglePicked} ordered={kind === "reorder"} />
      ) : null}

      {usesSingleColumn ? (
        <div className={cn("grid gap-3", kind === "replace" ? "sm:grid-cols-1" : "sm:grid-cols-2")}>
          <ColumnSelect label="Column" columns={columns} value={fromColumn} onChange={setFromColumn} />

          {kind === "cast" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">New type</label>
              <Select value={castType} onValueChange={setCastType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLUMN_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {kind === "sort" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Direction</label>
              <Select value={direction} onValueChange={(value) => setDirection(value as SortDirection)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {kind === "fill" ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Fill with</label>
                <Select value={fillStrategy} onValueChange={(value) => setFillStrategy(value as FillStrategy)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FILL_STRATEGIES.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {fillStrategy === "value" ? (
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-sm font-medium">Value</label>
                  <Input value={fillValue} onChange={(event) => setFillValue(event.target.value)} placeholder="UNKNOWN" />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {kind === "replace" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Find</label>
            <Input value={find} onChange={(event) => setFind(event.target.value)} className="font-mono text-sm" placeholder="N/A" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Replace with</label>
            <Input value={replacement} onChange={(event) => setReplacement(event.target.value)} className="font-mono text-sm" placeholder="" />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Treat Find as a regular expression</p>
              <p className="text-xs text-muted-foreground">Every match in the column is replaced.</p>
            </div>
            <Switch checked={useRegex} onCheckedChange={setUseRegex} />
          </div>
        </div>
      ) : null}

      {kind === "limit" ? (
        <div className="space-y-2">
          <label className="text-sm font-medium">Number of rows to keep</label>
          <Input type="number" min={1} value={limitCount} onChange={(event) => setLimitCount(event.target.value)} />
        </div>
      ) : null}

      <Button className="w-full" disabled={disabled || !operation} onClick={submit}>
        <Plus className="h-4 w-4" />
        Apply operation
      </Button>
    </div>
  )
}

function ColumnSelect({
  label,
  columns,
  value,
  onChange,
}: {
  label: string
  columns: string[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Pick a column" />
        </SelectTrigger>
        <SelectContent>
          {columns.map((column) => (
            <SelectItem key={column} value={column}>
              {column}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * Multi-select over the columns. When `ordered` is set the selection order is
 * shown as a rank, because that is the order the columns will end up in.
 */
function ColumnPicker({
  columns,
  picked,
  onToggle,
  ordered,
}: {
  columns: string[]
  picked: string[]
  onToggle: (name: string) => void
  ordered?: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{ordered ? "Click columns in the order you want" : "Columns"}</label>
        {picked.length > 0 ? <span className="text-xs text-muted-foreground">{picked.length} selected</span> : null}
      </div>
      <div className="max-h-56 overflow-y-auto rounded-xl border p-2">
        {columns.map((column) => {
          const rank = picked.indexOf(column)
          return (
            <button
              key={column}
              type="button"
              onClick={() => onToggle(column)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50"
            >
              <Checkbox checked={rank !== -1} className="pointer-events-none" />
              <span className="min-w-0 flex-1 truncate">{column}</span>
              {ordered && rank !== -1 ? (
                <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">{rank + 1}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
