"use client"

import { useMemo } from "react"
import { Download, ListChecks, Plus, RotateCcw, Trash2 } from "lucide-react"

import { EmptyState, Section, StatusAlert } from "@/components/common"
import { ExpressionField } from "@/components/expression-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { gridToCsv, safeFileName } from "@/lib/export"
import { suggestedRules } from "@/lib/operations"
import { COLUMN_TYPE_OPTIONS } from "@/lib/schema"
import { downloadFile } from "@/lib/storage"
import type { Grid, ValidationFinding, ValidationRule, ValidationSeverity } from "@/lib/types"
import { newId } from "@/lib/utils"

/** Findings are listed per rule; one broken column must not bury the rest. */
const VISIBLE_PER_RULE = 20

const RULE_KINDS: Array<{ value: ValidationRule["kind"]; label: string }> = [
  { value: "notNull", label: "Not empty" },
  { value: "unique", label: "Unique" },
  { value: "range", label: "Numeric range" },
  { value: "pattern", label: "Pattern" },
  { value: "expression", label: "Row expression" },
  { value: "length", label: "Text length" },
  { value: "type", label: "Type" },
]

const SEVERITIES: Array<{ value: ValidationSeverity; label: string }> = [
  { value: "error", label: "Error" },
  { value: "warning", label: "Warning" },
]

/** The rule's payload decides which fields it needs, so switching kind resets them. */
function withKind(rule: ValidationRule, kind: ValidationRule["kind"]): ValidationRule {
  const base = { id: rule.id, column: rule.column, severity: rule.severity }
  switch (kind) {
    case "notNull":
    case "unique":
      return { ...base, kind }
    case "range":
      return { ...base, kind, min: 0 }
    case "pattern":
      return { ...base, kind, pattern: "" }
    case "expression":
      return { ...base, kind, expression: "" }
    case "length":
      return { ...base, kind, minLength: 0 }
    case "type":
      return { ...base, kind, type: "INT" }
  }
}

/** One sentence for a rule, used for the group heading and the CSV export. */
function describeRule(rule: ValidationRule): string {
  switch (rule.kind) {
    case "notNull":
      return `${rule.column} must not be empty`
    case "unique":
      return `${rule.column} must be unique`
    case "range": {
      if (rule.min !== undefined && rule.max !== undefined) return `${rule.column} between ${rule.min} and ${rule.max}`
      if (rule.min !== undefined) return `${rule.column} at least ${rule.min}`
      return `${rule.column} at most ${rule.max}`
    }
    case "pattern":
      return `${rule.column} matching ${rule.pattern.trim() || "(no pattern yet)"}`
    case "expression":
      return `${rule.column} satisfying ${rule.expression.trim() || "(no expression yet)"}`
    case "length": {
      if (rule.minLength !== undefined && rule.maxLength !== undefined)
        return `${rule.column} between ${rule.minLength} and ${rule.maxLength} characters`
      if (rule.minLength !== undefined) return `${rule.column} at least ${rule.minLength} characters`
      return `${rule.column} at most ${rule.maxLength} characters`
    }
    case "type":
      return `${rule.column} parseable as ${rule.type}`
  }
}

const isBlank = (value: unknown) => value === null || value === undefined || value === ""

/**
 * The validate tab.
 *
 * Rules are editable data, and the findings they produce are computed from the
 * grid the user is looking at — the same grid the flagged cells are drawn on,
 * so a finding and its highlight can never disagree.
 */
export function ValidatePanel({
  grid,
  datasetName,
  rules,
  onRulesChange,
  findings,
  onJumpToRow,
}: {
  grid: Grid
  datasetName: string
  rules: ValidationRule[]
  onRulesChange: (rules: ValidationRule[]) => void
  findings: ValidationFinding[]
  onJumpToRow: (row: number) => void
}) {
  const columnNames = useMemo(() => grid.columns.map((column) => column.name), [grid.columns])

  const groups = useMemo(() => {
    const byRule = new Map<string, ValidationFinding[]>()
    for (const finding of findings) {
      const bucket = byRule.get(finding.ruleId)
      if (bucket) bucket.push(finding)
      else byRule.set(finding.ruleId, [finding])
    }
    return [...byRule.entries()].map(([ruleId, items]) => ({
      rule: rules.find((entry) => entry.id === ruleId) ?? null,
      findings: items,
    }))
  }, [findings, rules])

  const errorCount = findings.filter((finding) => finding.severity === "error").length
  const warningCount = findings.length - errorCount

  const replaceRule = (next: ValidationRule) => onRulesChange(rules.map((rule) => (rule.id === next.id ? next : rule)))

  const addRule = () => {
    const column = columnNames[0]
    if (!column) return
    onRulesChange([...rules, { id: newId("rule"), column, severity: "error", kind: "notNull" }])
  }

  const exportFindings = () => {
    const exportGrid: Grid = {
      columns: [
        { name: "rule", type: "TEXT", nullable: false },
        { name: "severity", type: "TEXT", nullable: false },
        { name: "row", type: "INT", nullable: false },
        { name: "column", type: "TEXT", nullable: false },
        { name: "value", type: "TEXT", nullable: true },
        { name: "message", type: "TEXT", nullable: false },
      ],
      rows: findings.map((finding) => {
        const rule = rules.find((entry) => entry.id === finding.ruleId)
        return [
          rule ? describeRule(rule) : finding.ruleId,
          finding.severity,
          finding.row + 1,
          finding.column,
          isBlank(finding.value) ? "" : String(finding.value),
          finding.message,
        ]
      }),
    }

    downloadFile(
      safeFileName(`${datasetName}-findings`, "csv"),
      gridToCsv(exportGrid),
      "text/csv;charset=utf-8",
    )
  }

  return (
    <div className="space-y-6">
      <Section
        title="Rules"
        description="Suggestions come from the columns themselves; every kind of rule can be added by hand."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onRulesChange(suggestedRules(grid))}>
              <RotateCcw className="size-3.5" />
              Reset to suggestions
            </Button>
            <Button size="sm" disabled={columnNames.length === 0} onClick={addRule}>
              <Plus className="size-4" />
              Add rule
            </Button>
          </div>
        }
      >
        {rules.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="h-5 w-5" />}
            title="No rules yet"
            description="Add a rule, or reset to the suggestions the columns imply. Nothing is checked until a rule exists."
          />
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <RuleEditor
                key={rule.id}
                rule={rule}
                columns={columnNames}
                onChange={replaceRule}
                onRemove={() => onRulesChange(rules.filter((entry) => entry.id !== rule.id))}
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Findings"
        description={
          findings.length === 0
            ? "Nothing flagged by the current rules."
            : `${findings.length.toLocaleString()} finding${findings.length === 1 ? "" : "s"} · ${errorCount} error${errorCount === 1 ? "" : "s"} · ${warningCount} warning${warningCount === 1 ? "" : "s"}`
        }
        actions={
          findings.length > 0 ? (
            <Button variant="outline" size="sm" onClick={exportFindings}>
              <Download className="size-3.5" />
              Export CSV
            </Button>
          ) : null
        }
      >
        {findings.length >= 500 ? (
          <StatusAlert tone="warning" className="mb-4">
            Validation stops after 500 findings, so the list below is a prefix of everything the rules would flag.
          </StatusAlert>
        ) : null}

        {findings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {rules.length === 0
              ? "Add a rule above to start checking this dataset."
              : "Every row passed every rule."}
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map(({ rule, findings: items }) => (
              <div key={rule?.id ?? items[0].ruleId} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={items[0].severity === "error" ? "destructive" : "secondary"}>
                    {items[0].severity}
                  </Badge>
                  <p className="min-w-0 text-sm font-medium">
                    {rule ? describeRule(rule) : `Rule ${items[0].ruleId} (removed)`}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {items.length.toLocaleString()} finding{items.length === 1 ? "" : "s"}
                  </span>
                </div>

                <ul className="divide-y overflow-hidden rounded-xl border">
                  {items.slice(0, VISIBLE_PER_RULE).map((finding, index) => (
                    <li key={`${finding.row}-${finding.column}-${index}`}>
                      <button
                        type="button"
                        onClick={() => onJumpToRow(finding.row)}
                        className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                      >
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          row {finding.row + 1}
                        </span>
                        <span className="truncate font-medium">{finding.column}</span>
                        <span className="max-w-64 truncate font-mono text-xs text-muted-foreground">
                          {isBlank(finding.value) ? "(empty)" : String(finding.value)}
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground">{finding.message}</span>
                      </button>
                    </li>
                  ))}
                </ul>

                {items.length > VISIBLE_PER_RULE ? (
                  <p className="text-xs text-muted-foreground">
                    Showing the first {VISIBLE_PER_RULE} of {items.length.toLocaleString()} findings for this rule.
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

/** One rule's editor. The fields follow the kind, so only relevant inputs appear. */
function RuleEditor({
  rule,
  columns,
  onChange,
  onRemove,
}: {
  rule: ValidationRule
  columns: string[]
  onChange: (rule: ValidationRule) => void
  onRemove: () => void
}) {
  const patternError = useMemo(() => {
    if (rule.kind !== "pattern" || rule.pattern === "") return null
    try {
      new RegExp(rule.pattern)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }, [rule])

  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={rule.kind} onValueChange={(value) => onChange(withKind(rule, value as ValidationRule["kind"]))}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RULE_KINDS.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={rule.column} onValueChange={(column) => onChange({ ...rule, column })}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {columns.map((column) => (
              <SelectItem key={column} value={column}>
                {column}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={rule.severity}
          onValueChange={(value) => onChange({ ...rule, severity: value as ValidationSeverity })}
        >
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITIES.map((entry) => (
              <SelectItem key={entry.value} value={entry.value}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Remove rule"
          className="ml-auto size-8 text-muted-foreground"
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {rule.kind === "range" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField label="Minimum" value={rule.min} onChange={(min) => onChange({ ...rule, min })} />
          <NumberField label="Maximum" value={rule.max} onChange={(max) => onChange({ ...rule, max })} />
        </div>
      ) : null}

      {rule.kind === "length" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            label="Shortest"
            value={rule.minLength}
            onChange={(minLength) => onChange({ ...rule, minLength })}
          />
          <NumberField
            label="Longest"
            value={rule.maxLength}
            onChange={(maxLength) => onChange({ ...rule, maxLength })}
          />
        </div>
      ) : null}

      {rule.kind === "pattern" ? (
        <div className="space-y-2">
          <label className="text-sm font-medium">Regular expression</label>
          <Input
            value={rule.pattern}
            spellCheck={false}
            className="font-mono text-sm"
            placeholder="^[A-Z]{2}-\d{4}$"
            onChange={(event) => onChange({ ...rule, pattern: event.target.value })}
          />
          {patternError ? (
            <p className="text-xs text-destructive">{patternError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Tested against the cell&apos;s text.</p>
          )}
        </div>
      ) : null}

      {rule.kind === "expression" ? (
        <ExpressionField
          columns={columns}
          value={rule.expression}
          label="Every row must satisfy"
          placeholder="amount >= 0 AND region != ''"
          onChange={(expression) => onChange({ ...rule, expression })}
        />
      ) : null}

      {rule.kind === "type" ? (
        <div className="space-y-2">
          <label className="text-sm font-medium">Expected type</label>
          <Select value={rule.type} onValueChange={(type) => onChange({ ...rule, type })}>
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
    </div>
  )
}

/** A blank field means "no bound", which is what an optional limit is. */
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (value: number | undefined) => void
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <Input
        type="number"
        value={value ?? ""}
        placeholder="No limit"
        onChange={(event) => {
          if (event.target.value === "") {
            onChange(undefined)
            return
          }
          const parsed = Number(event.target.value)
          if (Number.isFinite(parsed)) onChange(parsed)
        }}
      />
    </div>
  )
}
