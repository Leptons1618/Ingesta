"use client"

import { useMemo, useState } from "react"
import { CircleAlert, CircleCheck, CircleHelp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EXPRESSION_FUNCTIONS, validateExpression } from "@/lib/expression"
import { cn } from "@/lib/utils"

/**
 * A text field for an expression, with live validation and a function reference.
 *
 * The validation is the same `compileExpression` call the operation itself will
 * make, so a green field means the operation will run — not merely that the
 * syntax looks plausible.
 */
export function ExpressionField({
  value,
  onChange,
  columns,
  label = "Expression",
  placeholder = "e.g. amount > 100 AND region = 'EU'",
  disabled,
  className,
}: {
  value: string
  onChange: (value: string) => void
  /** Column names the expression may read. */
  columns: string[]
  label?: string
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const [helpOpen, setHelpOpen] = useState(false)

  const result = useMemo(() => (value.trim() ? validateExpression(value, columns) : null), [columns, value])

  const groups = useMemo(() => {
    const byGroup = new Map<string, typeof EXPRESSION_FUNCTIONS>()
    for (const entry of EXPRESSION_FUNCTIONS) {
      const bucket = byGroup.get(entry.group)
      if (bucket) bucket.push(entry)
      else byGroup.set(entry.group, [entry])
    }
    return [...byGroup.entries()]
  }, [])

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="expression-field" className="text-sm font-medium">{label}</label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground"
          onClick={() => setHelpOpen((open) => !open)}
        >
          <CircleHelp className="h-3.5 w-3.5" />
          {helpOpen ? "Hide functions" : "Functions"}
        </Button>
      </div>

      <Input
        id="expression-field"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={false}
        className="font-mono text-sm"
        onChange={(event) => onChange(event.target.value)}
      />

      {result ? (
        result.ok ? (
          <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CircleCheck className="h-3.5 w-3.5" />
            {result.columns.length === 0 ? "Valid — reads no columns" : `Valid — reads ${result.columns.join(", ")}`}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <CircleAlert className="h-3.5 w-3.5" />
            {result.error}
          </p>
        )
      ) : (
        <p className="text-xs text-muted-foreground">
          Reference a column by name, or wrap it in square brackets when it contains spaces.
        </p>
      )}

      {helpOpen ? (
        <div className="max-h-72 space-y-4 overflow-y-auto rounded-xl border bg-muted/20 p-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Columns</p>
            <p className="font-mono text-xs break-words">{columns.map((column) => `[${column}]`).join("  ")}</p>
          </div>
          {groups.map(([group, entries]) => (
            <div key={group} className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</p>
              <ul className="space-y-0.5">
                {entries.map((entry) => (
                  <li key={entry.name} className="flex flex-wrap items-baseline gap-2 text-xs">
                    <code className="font-mono text-foreground">{entry.signature}</code>
                    <span className="text-muted-foreground">{entry.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
