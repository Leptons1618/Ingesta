/**
 * Guardrails.
 *
 * Nothing here blocks anything by itself — every function returns an
 * assessment, and the UI decides whether to show an inline warning or demand a
 * typed confirmation. Keeping the judgement in one module means a destructive
 * operation is classified the same way wherever it is triggered from.
 */

import type { GuardrailAssessment, RiskLevel, TableSnapshot } from "@/lib/types"

/** Verbs that cannot change data or schema. */
const READ_ONLY_VERBS: Record<string, true> = {
  select: true,
  with: true,
  explain: true,
  show: true,
  describe: true,
  desc: true,
  values: true,
}

/** SQLite pragmas that only read. Anything else is treated as a write. */
const READ_ONLY_PRAGMAS: Record<string, true> = {
  table_info: true,
  table_xinfo: true,
  table_list: true,
  index_list: true,
  index_info: true,
  index_xinfo: true,
  foreign_key_list: true,
  database_list: true,
  compile_options: true,
  collation_list: true,
  function_list: true,
  module_list: true,
  pragma_list: true,
  integrity_check: true,
  quick_check: true,
  page_count: true,
  page_size: true,
  freelist_count: true,
  schema_version: true,
  user_version: true,
  encoding: true,
  application_id: true,
}

export interface SqlAnalysis {
  /** Statements found, in order, with comments and blank tails removed. */
  statements: string[]
  /** Leading keyword of each statement, lowercased. */
  verbs: string[]
  /** True when every statement only reads. */
  readOnly: boolean
  /** Set when the SQL must not run at all, whatever the caller allows. */
  blockedReason?: string
}

/**
 * Removes `--` line comments and `/* *\/` block comments without touching
 * string literals, then splits on semicolons that are also outside literals.
 * This is what stops `SELECT 1; DROP TABLE t` from looking read-only.
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ""
  let quote: string | null = null

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]
    const next = sql[index + 1]

    if (quote) {
      current += char
      if (char === quote) {
        // A doubled quote is an escaped quote, not the end of the literal.
        if (next === quote) {
          current += next
          index += 1
        } else {
          quote = null
        }
      }
      continue
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char
      current += char
      continue
    }

    if (char === "-" && next === "-") {
      while (index < sql.length && sql[index] !== "\n") index += 1
      continue
    }

    if (char === "/" && next === "*") {
      index += 2
      while (index < sql.length && !(sql[index] === "*" && sql[index + 1] === "/")) index += 1
      index += 1
      continue
    }

    if (char === ";") {
      statements.push(current)
      current = ""
      continue
    }

    current += char
  }

  statements.push(current)
  return statements.map((statement) => statement.trim()).filter((statement) => statement.length > 0)
}

export function analyseSql(sql: string): SqlAnalysis {
  const statements = splitStatements(sql)
  const verbs = statements.map((statement) => (statement.match(/^[A-Za-z_]+/)?.[0] ?? "").toLowerCase())

  const pragmaName = (statement: string) => statement.match(/^pragma\s+([A-Za-z_]+)/i)?.[1]?.toLowerCase() ?? ""

  let blockedReason: string | undefined

  if (statements.length === 0) {
    blockedReason = "There is no statement to run"
  } else if (statements.length > 1) {
    blockedReason = `Only one statement may run at a time; this text contains ${statements.length}. Remove the extra statements and run them one by one.`
  } else if (verbs[0] === "pragma" && READ_ONLY_PRAGMAS[pragmaName(statements[0])] !== true) {
    const name = pragmaName(statements[0])
    blockedReason = `PRAGMA ${name || "(unnamed)"} can change the database file. Only read-only pragmas are allowed here.`
  }

  const readOnly =
    blockedReason === undefined &&
    verbs.every((verb, position) =>
      verb === "pragma" ? READ_ONLY_PRAGMAS[pragmaName(statements[position])] === true : READ_ONLY_VERBS[verb] === true,
    )

  return { statements, verbs, readOnly, blockedReason }
}

/** `DELETE FROM t` and `UPDATE t SET …` with no WHERE touch every row. */
function missingWhere(sql: string): boolean {
  return !/\bwhere\b/i.test(sql)
}

export function assessSql(sql: string, { allowWrite }: { allowWrite: boolean }): GuardrailAssessment {
  const analysis = analyseSql(sql)

  if (analysis.blockedReason) {
    return {
      risk: "destructive",
      title: "This statement will not run",
      summary: analysis.blockedReason,
      warnings: [],
    }
  }

  if (analysis.readOnly) {
    return {
      risk: "safe",
      title: "Read-only query",
      summary: "This statement only reads rows; nothing in the database changes.",
      warnings: [],
    }
  }

  if (!allowWrite) {
    return {
      risk: "destructive",
      title: `Write access is off`,
      summary: `"${analysis.verbs[0].toUpperCase()}" changes the database. Turn on write access in the query panel to run it.`,
      warnings: ["Write access is disabled in Settings, and stays off until you turn it on."],
    }
  }

  const verb = analysis.verbs[0].toUpperCase()
  const warnings: string[] = []
  const broad = (analysis.verbs[0] === "delete" || analysis.verbs[0] === "update") && missingWhere(analysis.statements[0])
  if (broad) warnings.push(`There is no WHERE clause, so every row in the table is affected.`)

  return {
    risk: broad ? "destructive" : "caution",
    title: `${verb} statement`,
    summary: broad
      ? "This statement changes every row in the target table."
      : "This statement changes the database. It cannot be undone unless you took a snapshot first.",
    warnings,
    confirmation: broad ? "EXECUTE" : undefined,
  }
}

function rowWord(count: number | undefined): string {
  if (count === undefined) return "an unknown number of rows"
  return `${count.toLocaleString()} row${count === 1 ? "" : "s"}`
}

export function assessDropTable(table: string, rowCount?: number): GuardrailAssessment {
  return {
    risk: "destructive",
    title: `Drop table "${table}"`,
    summary: `The table and the ${rowWord(rowCount)} it holds are removed from the database. This cannot be undone.`,
    warnings: [
      "Every row is deleted, and the table definition is deleted with it.",
      "Take a snapshot first if you might need the data back.",
    ],
    confirmation: table,
  }
}

export function assessTruncate(table: string, rowCount?: number): GuardrailAssessment {
  return {
    risk: "destructive",
    title: `Delete every row in "${table}"`,
    summary: `All ${rowWord(rowCount)} are removed. The table itself is kept, so its columns and types stay as they are.`,
    warnings: ["This cannot be undone unless you took a snapshot first."],
    confirmation: table,
  }
}

export function assessDropColumn(table: string, column: string, rowCount?: number): GuardrailAssessment {
  return {
    risk: "destructive",
    title: `Drop column "${column}"`,
    summary: `The column is removed from "${table}", along with its values for all ${rowWord(rowCount)}.`,
    warnings: [
      "The values in this column are not recoverable after the change.",
      "Engines that require a rebuild (SQLite) rewrite the whole table.",
    ],
    confirmation: column,
  }
}

export function assessChangeType(table: string, column: string, from: string, to: string): GuardrailAssessment {
  return {
    risk: "caution",
    title: `Change "${column}" from ${from} to ${to}`,
    summary: `Every value in the column is converted. Values that do not fit the new type are rejected by the database and abort the change.`,
    warnings: [
      "The change fails as a whole if any row cannot be converted.",
      "Text columns narrowed to a shorter length can lose characters.",
    ],
    confirmation: undefined,
  }
}

export function assessRenameTable(from: string, to: string): GuardrailAssessment {
  return {
    risk: "caution",
    title: `Rename "${from}" to "${to}"`,
    summary: "The table keeps its rows. Anything pointing at the old name — views, queries, saved connections in other tools — breaks.",
    warnings: [],
  }
}

export function assessRowDelete(table: string, count: number): GuardrailAssessment {
  const broad = count === 0
  return {
    risk: "destructive",
    title: broad ? `Delete every row in "${table}"` : `Delete ${rowWord(count)} from "${table}"`,
    summary: broad
      ? "No rows are selected, so this deletes the entire table's contents."
      : `${rowWord(count)} will be removed from "${table}".`,
    warnings: count > 500 ? ["Deleting this many rows at once can take a while on a remote server."] : [],
    confirmation: broad ? table : undefined,
  }
}

export function assessRowUpdate(table: string, count: number): GuardrailAssessment {
  return {
    risk: count > 500 ? "destructive" : "caution",
    title: `Update ${rowWord(count)} in "${table}"`,
    summary: "The edited values replace what is stored now. The previous values are only recoverable from a snapshot.",
    warnings: count > 500 ? ["Editing this many rows at once can take a while on a remote server."] : [],
    confirmation: count > 500 ? table : undefined,
  }
}

export function assessOverwrite(target: string, rowCount: number, mode: "create" | "append" | "replace"): GuardrailAssessment {
  if (mode === "create") {
    return {
      risk: "safe",
      title: `Create table "${target}"`,
      summary: `A new table is created with ${rowWord(rowCount)}. Nothing that exists now is touched.`,
      warnings: [],
    }
  }

  if (mode === "append") {
    return {
      risk: "caution",
      title: `Append ${rowWord(rowCount)} to "${target}"`,
      summary: "The rows are added to the end of the table. Existing rows are left alone.",
      warnings: [
        "Rows are matched by column name, and anything the table requires but the data lacks is sent as NULL.",
        "A rejected row aborts the whole batch, so the table keeps the rows it has now.",
      ],
    }
  }

  return {
    risk: "destructive",
    title: `Replace the contents of "${target}"`,
    summary: `Every row currently in "${target}" is deleted and replaced with ${rowWord(rowCount)}.`,
    warnings: [
      "The existing rows are gone; only a snapshot can bring them back.",
      "The table definition — columns, types and keys — is kept.",
    ],
    confirmation: target,
  }
}

export function assessRestoreSnapshot(snapshot: TableSnapshot, currentRows: number): GuardrailAssessment {
  return {
    risk: "destructive",
    title: `Restore "${snapshot.table}" from ${snapshot.name}`,
    summary: `The table's current ${rowWord(currentRows)} are deleted and replaced with the ${rowWord(snapshot.rowCount)} captured on ${new Date(snapshot.createdAt).toLocaleString()}.`,
    warnings: [
      "Everything written to the table since the snapshot is lost.",
      "The snapshot itself is kept, so this can be repeated.",
    ],
    confirmation: snapshot.table,
  }
}

export function assessDropSnapshot(snapshot: TableSnapshot): GuardrailAssessment {
  return {
    risk: "caution",
    title: `Delete snapshot ${snapshot.name}`,
    summary: "The stored copy is removed. The source table is not touched.",
    warnings: ["Restoring from this snapshot stops being possible."],
  }
}

export function assessDropDatabase(name: string): GuardrailAssessment {
  return {
    risk: "destructive",
    title: `Drop database "${name}"`,
    summary: "The database and every table inside it are removed from the server.",
    warnings: [
      "Every table, view and stored procedure in the database is deleted.",
      "This is not reversible from inside this app; snapshots live in the database being dropped.",
    ],
    confirmation: name,
  }
}

export function assessDropRows(table: string, count: number): GuardrailAssessment {
  return assessRowDelete(table, count)
}

/** Returns an assessment only when an import is large enough to warn about. */
export function assessLargeImport(rows: number, limit: number): GuardrailAssessment | null {
  if (rows <= limit) return null
  return {
    risk: "caution",
    title: "This import is larger than the retention limit",
    summary: `${rows.toLocaleString()} rows were read, and the workspace keeps at most ${limit.toLocaleString()} rows per dataset.`,
    warnings: [
      "Only the first rows are kept in the browser; the rest are not imported.",
      "Raise the limit in Settings if the machine has the memory for it.",
    ],
  }
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  safe: "No risk",
  caution: "Changes data",
  destructive: "Destructive",
}
