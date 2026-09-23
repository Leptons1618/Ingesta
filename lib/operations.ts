/**
 * The data operation engine.
 *
 * Every change a user makes to a dataset is a `DataOperation` — a small, plain
 * object. Applying one is a pure function over a `Grid`, so a dataset is always
 * "base grid + ordered operations" and rolling back is truncating the list and
 * replaying. Nothing has to be undone in place, and the history can be replayed
 * byte-for-byte to reach any earlier state.
 */

import { compileExpression, isTruthy, toNumber, toText, type CompiledExpression } from "@/lib/expression"
import { coerceCell } from "@/lib/transform"
import type {
  ColumnAnalysis,
  DataOperation,
  FillStrategy,
  Grid,
  GridColumn,
  OperationEffect,
  OperationEntry,
  TableCreationConfig,
  ValidationFinding,
  ValidationRule,
} from "@/lib/types"
import { newId } from "@/lib/utils"

export interface OperationOutcome {
  grid: Grid
  effect: OperationEffect
  /** Present for `validate`, which reads the data without changing it. */
  findings?: ValidationFinding[]
}

/** Findings are capped so one broken column cannot produce a million rows. */
const MAX_FINDINGS = 500

const isBlank = (value: unknown) => value === null || value === undefined || value === "" || (typeof value === "string" && value.trim() === "")

export function columnIndex(grid: Grid, name: string): number {
  return grid.columns.findIndex((column) => column.name === name)
}

/** Two columns may not share a name, so a derived column gets a suffix. */
export function uniqueColumnName(grid: Grid, base: string): string {
  const taken = new Set(grid.columns.map((column) => column.name.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  let suffix = 2
  while (taken.has(`${base}_${suffix}`.toLowerCase())) suffix += 1
  return `${base}_${suffix}`
}

function emptyEffect(grid: Grid): OperationEffect {
  return { rowsIn: grid.rows.length, rowsOut: grid.rows.length, cellsChanged: 0, columnsIn: grid.columns.length, columnsOut: grid.columns.length }
}

/** Counts how many cells differ, so the history reports measured work. */
function countChanged(before: unknown[][], after: unknown[][]): number {
  let changed = 0
  for (let row = 0; row < after.length; row += 1) {
    const previous = before[row]
    if (!previous) continue
    for (let cell = 0; cell < after[row].length; cell += 1) {
      if (previous[cell] !== after[row][cell]) changed += 1
    }
  }
  return changed
}

/** Maps one column in place, returning a new grid and the number of cells touched. */
function mapColumn(grid: Grid, index: number, map: (value: unknown) => unknown): { grid: Grid; changed: number } {
  let changed = 0
  const rows = grid.rows.map((row) => {
    const next = row.slice()
    const value = map(row[index])
    if (value !== row[index]) changed += 1
    next[index] = value
    return next
  })
  return { grid: { columns: grid.columns, rows }, changed }
}

function numericValues(grid: Grid, index: number): number[] {
  const values: number[] = []
  for (const row of grid.rows) {
    const parsed = toNumber(row[index])
    if (parsed !== null) values.push(parsed)
  }
  return values
}

function modeValue(grid: Grid, index: number): unknown {
  const counts = new Map<string, { value: unknown; count: number }>()
  for (const row of grid.rows) {
    if (isBlank(row[index])) continue
    const key = toText(row[index])
    const entry = counts.get(key)
    if (entry) entry.count += 1
    else counts.set(key, { value: row[index], count: 1 })
  }
  let best: { value: unknown; count: number } | null = null
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry
  }
  return best ? best.value : null
}

function fillValue(grid: Grid, index: number, strategy: FillStrategy, literal: string | undefined): unknown {
  switch (strategy) {
    case "value":
      return literal ?? ""
    case "mean": {
      const values = numericValues(grid, index)
      return values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length
    }
    case "median": {
      const values = numericValues(grid, index).sort((a, b) => a - b)
      if (values.length === 0) return null
      const middle = Math.floor(values.length / 2)
      return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle]
    }
    case "mode":
      return modeValue(grid, index)
    case "forward":
    case "backward":
      return null // handled by the caller, which needs the neighbouring rows
  }
}

/** Applies one operation. Pure: the input grid is never mutated. */
export function applyOperation(grid: Grid, operation: DataOperation): OperationOutcome {
  switch (operation.kind) {
    case "filter": {
      const compiled = compileExpression(operation.expression, grid.columns.map((column) => column.name))
      const rows = grid.rows.filter((row) => isTruthy(compiled.evaluate(row)))
      return {
        grid: { columns: grid.columns, rows },
        effect: { rowsIn: grid.rows.length, rowsOut: rows.length, cellsChanged: 0, columnsIn: grid.columns.length, columnsOut: grid.columns.length },
      }
    }

    case "derive": {
      const compiled = compileExpression(operation.expression, grid.columns.map((column) => column.name))
      const name = uniqueColumnName(grid, operation.column)
      const column: GridColumn = { name, type: operation.type, nullable: true }
      const rows = grid.rows.map((row) => [...row, compiled.evaluate(row)])
      return {
        grid: { columns: [...grid.columns, column], rows },
        effect: { rowsIn: grid.rows.length, rowsOut: rows.length, cellsChanged: rows.length, columnsIn: grid.columns.length, columnsOut: grid.columns.length + 1 },
      }
    }

    case "rename": {
      const index = columnIndex(grid, operation.from)
      if (index === -1) throw new Error(`Column "${operation.from}" no longer exists`)
      if (grid.columns.some((column) => column.name.toLowerCase() === operation.to.toLowerCase() && column.name !== operation.from)) {
        throw new Error(`A column named "${operation.to}" already exists`)
      }
      const columns = grid.columns.map((column, position) => (position === index ? { ...column, name: operation.to } : column))
      return { grid: { columns, rows: grid.rows }, effect: { ...emptyEffect(grid), cellsChanged: 0 } }
    }

    case "drop": {
      const drop = new Set(operation.columns)
      const keep = grid.columns.map((column, index) => ({ column, index })).filter(({ column }) => !drop.has(column.name))
      if (keep.length === 0) throw new Error("A grid needs at least one column")
      return {
        grid: { columns: keep.map(({ column }) => column), rows: grid.rows.map((row) => keep.map(({ index }) => row[index])) },
        effect: { rowsIn: grid.rows.length, rowsOut: grid.rows.length, cellsChanged: 0, columnsIn: grid.columns.length, columnsOut: keep.length },
      }
    }

    case "keep": {
      const keep = operation.columns
        .map((name) => ({ column: grid.columns[columnIndex(grid, name)], index: columnIndex(grid, name) }))
        .filter(({ column }) => Boolean(column))
      if (keep.length === 0) throw new Error("A grid needs at least one column")
      return {
        grid: { columns: keep.map(({ column }) => column), rows: grid.rows.map((row) => keep.map(({ index }) => row[index])) },
        effect: { rowsIn: grid.rows.length, rowsOut: grid.rows.length, cellsChanged: 0, columnsIn: grid.columns.length, columnsOut: keep.length },
      }
    }

    case "reorder": {
      const wanted = operation.columns.map((name) => columnIndex(grid, name)).filter((index) => index !== -1)
      // Anything the caller did not name keeps its relative position at the end.
      const remainder = grid.columns.map((_, index) => index).filter((index) => !wanted.includes(index))
      const order = [...wanted, ...remainder]
      if (order.length !== grid.columns.length) throw new Error("A reorder must name each column exactly once")
      return {
        grid: {
          columns: order.map((index) => grid.columns[index]),
          rows: grid.rows.map((row) => order.map((index) => row[index])),
        },
        effect: emptyEffect(grid),
      }
    }

    case "cast": {
      const index = columnIndex(grid, operation.column)
      if (index === -1) throw new Error(`Column "${operation.column}" no longer exists`)
      const result = mapColumn(grid, index, (value) => coerceCell(value, operation.type))
      const columns = grid.columns.map((column, position) => (position === index ? { ...column, type: operation.type } : column))
      return {
        grid: { columns, rows: result.grid.rows },
        effect: { ...emptyEffect(grid), cellsChanged: result.changed },
      }
    }

    case "fill": {
      const index = columnIndex(grid, operation.column)
      if (index === -1) throw new Error(`Column "${operation.column}" no longer exists`)
      const column = grid.columns[index]
      const replacement = fillValue(grid, index, operation.strategy, operation.value)
      let carried: unknown = null

      const rows = grid.rows.map((row) => {
        const next = row.slice()
        if (!isBlank(row[index])) {
          carried = row[index]
          return next
        }
        if (operation.strategy === "forward") {
          next[index] = carried === null ? null : coerceCell(carried, column.type)
          return next
        }
        next[index] = replacement === null ? null : coerceCell(replacement, column.type)
        return next
      })

      if (operation.strategy === "backward") {
        let following: unknown = null
        for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex -= 1) {
          const value = rows[rowIndex][index]
          if (!isBlank(value)) {
            following = value
            continue
          }
          rows[rowIndex][index] = following
        }
      }

      return { grid: { columns: grid.columns, rows }, effect: { ...emptyEffect(grid), cellsChanged: countChanged(grid.rows, rows) } }
    }

    case "dedupe": {
      const keys = operation.columns.length > 0 ? operation.columns.map((name) => columnIndex(grid, name)).filter((index) => index !== -1) : grid.columns.map((_, index) => index)
      const seen = new Set<string>()
      const rows = grid.rows.filter((row) => {
        const key = JSON.stringify(keys.map((index) => row[index] ?? null))
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      return {
        grid: { columns: grid.columns, rows },
        effect: { rowsIn: grid.rows.length, rowsOut: rows.length, cellsChanged: 0, columnsIn: grid.columns.length, columnsOut: grid.columns.length },
      }
    }

    case "sort": {
      const index = columnIndex(grid, operation.column)
      if (index === -1) throw new Error(`Column "${operation.column}" no longer exists`)
      const direction = operation.direction === "desc" ? -1 : 1
      const rows = grid.rows.slice().sort((left, right) => {
        const a = left[index]
        const b = right[index]
        // Blanks sort last in both directions, which is what a reader expects.
        const aBlank = isBlank(a)
        const bBlank = isBlank(b)
        if (aBlank && bBlank) return 0
        if (aBlank) return 1
        if (bBlank) return -1
        const aNumber = toNumber(a)
        const bNumber = toNumber(b)
        if (aNumber !== null && bNumber !== null) return (aNumber - bNumber) * direction
        return toText(a).localeCompare(toText(b), undefined, { numeric: true }) * direction
      })
      return { grid: { columns: grid.columns, rows }, effect: emptyEffect(grid) }
    }

    case "trim": {
      let rows = grid.rows
      let changed = 0
      for (const name of operation.columns) {
        const index = columnIndex({ columns: grid.columns, rows }, name)
        if (index === -1) continue
        const result = mapColumn({ columns: grid.columns, rows }, index, (value) => (typeof value === "string" ? value.trim() : value))
        rows = result.grid.rows
        changed += result.changed
      }
      return { grid: { columns: grid.columns, rows }, effect: { ...emptyEffect(grid), cellsChanged: changed } }
    }

    case "replace": {
      const index = columnIndex(grid, operation.column)
      if (index === -1) throw new Error(`Column "${operation.column}" no longer exists`)
      const pattern = operation.regex ? new RegExp(operation.find, "g") : null
      const result = mapColumn(grid, index, (value) => {
        if (typeof value !== "string") return value
        return pattern ? value.replace(pattern, operation.replacement) : value.split(operation.find).join(operation.replacement)
      })
      return { grid: { columns: grid.columns, rows: result.grid.rows }, effect: { ...emptyEffect(grid), cellsChanged: result.changed } }
    }

    case "limit": {
      const rows = grid.rows.slice(0, Math.max(0, operation.count))
      return {
        grid: { columns: grid.columns, rows },
        effect: { rowsIn: grid.rows.length, rowsOut: rows.length, cellsChanged: 0, columnsIn: grid.columns.length, columnsOut: grid.columns.length },
      }
    }
  }
}

/** Replays a whole operation list from the base grid. */
export function applyOperations(base: Grid, operations: DataOperation[]): { grid: Grid; effects: OperationEffect[] } {
  let grid = base
  const effects: OperationEffect[] = []
  for (const operation of operations) {
    const outcome = applyOperation(grid, operation)
    grid = outcome.grid
    effects.push(outcome.effect)
  }
  return { grid, effects }
}

/** One sentence a user can read in the history list. */
export function describeOperation(operation: DataOperation): string {
  switch (operation.kind) {
    case "filter":
      return `Kept rows where ${operation.expression}`
    case "derive":
      return `Added column "${operation.column}" = ${operation.expression}`
    case "rename":
      return `Renamed "${operation.from}" to "${operation.to}"`
    case "drop":
      return `Removed ${operation.columns.length} column${operation.columns.length === 1 ? "" : "s"}: ${operation.columns.join(", ")}`
    case "keep":
      return `Kept only ${operation.columns.join(", ")}`
    case "reorder":
      return `Reordered columns to ${operation.columns.join(", ")}`
    case "cast":
      return `Cast "${operation.column}" to ${operation.type}`
    case "fill": {
      const how = operation.strategy === "value" ? `"${operation.value ?? ""}"` : operation.strategy
      return `Filled blanks in "${operation.column}" with ${how}`
    }
    case "dedupe":
      return operation.columns.length === 0 ? "Removed duplicate rows" : `Removed duplicates on ${operation.columns.join(", ")}`
    case "sort":
      return `Sorted by "${operation.column}" ${operation.direction === "asc" ? "ascending" : "descending"}`
    case "trim":
      return `Trimmed whitespace in ${operation.columns.join(", ")}`
    case "replace":
      return `Replaced ${operation.regex ? "pattern" : `"${operation.find}"`} with "${operation.replacement}" in "${operation.column}"`
    case "limit":
      return `Kept the first ${operation.count.toLocaleString()} rows`
  }
}

/** Wraps an operation with its measured effect for the history list. */
export function toEntry(operation: DataOperation, effect: OperationEffect): OperationEntry {
  return { id: newId("op"), operation, createdAt: new Date().toISOString(), summary: describeOperation(operation), effect }
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function ruleMessage(rule: ValidationRule, value: unknown): string {
  switch (rule.kind) {
    case "notNull":
      return "Value is required"
    case "unique":
      return "Value is duplicated"
    case "range":
      if (rule.min !== undefined && rule.max !== undefined) return `Value must be between ${rule.min} and ${rule.max}`
      return rule.min !== undefined ? `Value must be at least ${rule.min}` : `Value must be at most ${rule.max}`
    case "pattern":
      return `Value must match ${rule.pattern}`
    case "expression":
      return `Value must satisfy ${rule.expression}`
    case "length":
      if (rule.minLength !== undefined && rule.maxLength !== undefined) return `Length must be between ${rule.minLength} and ${rule.maxLength}`
      return rule.minLength !== undefined ? `Length must be at least ${rule.minLength}` : `Length must be at most ${rule.maxLength}`
    case "type":
      return `Value must be a valid ${rule.type}`
    default:
      return `Invalid value: ${toText(value)}`
  }
}

/**
 * Runs every rule over the grid. Rules are evaluated against the whole column
 * where they need to be (`unique`), so this is a single pass per rule.
 */
export function validateGrid(grid: Grid, rules: ValidationRule[]): ValidationFinding[] {
  const findings: ValidationFinding[] = []

  for (const rule of rules) {
    const index = columnIndex(grid, rule.column)
    if (index === -1) continue

    if (rule.kind === "unique") {
      const seen = new Map<string, number>()
      grid.rows.forEach((row, rowIndex) => {
        const value = row[index]
        if (isBlank(value)) return
        const key = toText(value)
        const first = seen.get(key)
        if (first === undefined) {
          seen.set(key, rowIndex)
          return
        }
        if (findings.length < MAX_FINDINGS) {
          findings.push({ ruleId: rule.id, column: rule.column, row: rowIndex, severity: rule.severity, message: `Value is duplicated (first seen at row ${first + 1})`, value })
        }
      })
      continue
    }

    if (rule.kind === "expression") {
      let compiled: CompiledExpression
      try {
        compiled = compileExpression(rule.expression, grid.columns.map((column) => column.name))
      } catch {
        continue // A broken rule is reported by the editor, not per row.
      }
      grid.rows.forEach((row, rowIndex) => {
        if (findings.length >= MAX_FINDINGS) return
        if (!isTruthy(compiled.evaluate(row))) {
          findings.push({ ruleId: rule.id, column: rule.column, row: rowIndex, severity: rule.severity, message: ruleMessage(rule, row[index]), value: row[index] })
        }
      })
      continue
    }

    grid.rows.forEach((row, rowIndex) => {
      if (findings.length >= MAX_FINDINGS) return
      const value = row[index]
      let failed = false

      switch (rule.kind) {
        case "notNull":
          failed = isBlank(value)
          break
        case "range": {
          const parsed = toNumber(value)
          if (isBlank(value)) break
          failed = parsed === null || (rule.min !== undefined && parsed < rule.min) || (rule.max !== undefined && parsed > rule.max)
          break
        }
        case "pattern": {
          if (isBlank(value)) break
          try {
            failed = !new RegExp(rule.pattern).test(toText(value))
          } catch {
            failed = false
          }
          break
        }
        case "length": {
          if (isBlank(value)) break
          const length = toText(value).length
          failed = (rule.minLength !== undefined && length < rule.minLength) || (rule.maxLength !== undefined && length > rule.maxLength)
          break
        }
        case "type": {
          if (isBlank(value)) break
          const upper = rule.type.toUpperCase()
          if (/INT|DECIMAL|NUMERIC|REAL|FLOAT|DOUBLE/.test(upper)) failed = toNumber(value) === null
          else if (/DATE|TIMESTAMP|DATETIME/.test(upper)) failed = !/^\d{4}-\d{2}-\d{2}/.test(toText(value))
          else if (/BOOLEAN|BIT/.test(upper)) failed = !/^(true|false|0|1|yes|no|y|n)$/i.test(toText(value))
          break
        }
        default:
          break
      }

      if (failed) {
        findings.push({ ruleId: rule.id, column: rule.column, row: rowIndex, severity: rule.severity, message: ruleMessage(rule, value), value })
      }
    })
  }

  return findings
}

/** A starting rule set derived from the grid's own column metadata. */
export function suggestedRules(grid: Grid): ValidationRule[] {
  const rules: ValidationRule[] = []
  for (const column of grid.columns) {
    if (!column.nullable) rules.push({ id: newId("rule"), column: column.name, severity: "error", kind: "notNull" })
    if (column.isPrimaryKey) rules.push({ id: newId("rule"), column: column.name, severity: "error", kind: "unique" })
  }
  return rules
}

/** Compact key for the grid's flagged-cell lookup: `row:columnIndex`. */
export function findingKey(row: number, column: number): string {
  return `${row}:${column}`
}

/** Turns findings into the map the grid renders, keeping the worst severity. */
export function findingsByCell(grid: Grid, findings: ValidationFinding[]): Map<string, "error" | "warning"> {
  const map = new Map<string, "error" | "warning">()
  for (const finding of findings) {
    const index = columnIndex(grid, finding.column)
    if (index === -1) continue
    const key = findingKey(finding.row, index)
    if (finding.severity === "error" || !map.has(key)) map.set(key, finding.severity)
  }
  return map
}

/** Estimated in-memory size of a grid, used by the retention dashboard. */
export function gridBytes(grid: Grid): number {
  let bytes = grid.columns.reduce((total, column) => total + column.name.length + column.type.length + 16, 0)
  for (const row of grid.rows) {
    for (const cell of row) {
      if (cell === null || cell === undefined) bytes += 4
      else if (typeof cell === "number") bytes += 8
      else if (typeof cell === "boolean") bytes += 4
      else bytes += String(cell).length * 2
    }
  }
  return bytes
}

/* -------------------------------------------------------------------------- */
/* Writing a grid back out                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `createTable` speaks `ColumnAnalysis`, which carries detection metadata a
 * `Grid` has already resolved. Synthesising the fields it needs keeps the two
 * shapes from drifting: type and nullability come straight from the column, and
 * the counts are measured from the rows rather than guessed.
 */
export function gridToTableConfig(grid: Grid, tableName: string, primaryKey?: string): TableCreationConfig {
  const columns: ColumnAnalysis[] = grid.columns.map((column, index) => {
    const values = grid.rows.map((row) => row[index])
    return {
      name: column.name,
      suggestedType: column.type,
      nullable: column.nullable,
      samples: values.filter((value) => !isBlank(value)).slice(0, 5),
      uniqueValues: new Set(values.map((value) => String(value ?? ""))).size,
      nullCount: values.filter(isBlank).length,
      totalCount: values.length,
    }
  })

  return { tableName, columns, primaryKey }
}

/** Every cell is coerced to its column's type before it reaches a driver. */
export function gridToRows(grid: Grid): unknown[][] {
  return grid.rows.map((row) => grid.columns.map((column, index) => coerceCell(row[index], column.type)))
}
