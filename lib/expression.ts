/**
 * A small, self-contained expression language for filtering, deriving columns
 * and validating rows.
 *
 * It is a hand-written tokenizer + recursive-descent parser + tree-walking
 * evaluator. There is deliberately no `eval`, no `new Function`, and no access
 * to any global: an expression can only read the columns it is given and call
 * the functions in `FUNCTIONS`. That makes it safe to run over user text.
 *
 * Null handling is SQL-ish but simpler: comparisons against null are false,
 * arithmetic against null yields null, and `AND`/`OR` treat null as false.
 */

export type ExpressionValue = string | number | boolean | null

export class ExpressionError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message)
    this.name = "ExpressionError"
  }
}

/* -------------------------------------------------------------------------- */
/* Tokens                                                                     */
/* -------------------------------------------------------------------------- */

type TokenType = "number" | "string" | "identifier" | "column" | "operator" | "lparen" | "rparen" | "comma" | "eof"

interface Token {
  type: TokenType
  value: string
  position: number
}

const OPERATORS = [
  "==",
  "!=",
  "<>",
  "<=",
  ">=",
  "||",
  "=",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
] as const

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0

  while (index < source.length) {
    const char = source[index]

    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      index += 1
      continue
    }

    // [Column Name] — the escape hatch for headers with spaces or punctuation.
    if (char === "[") {
      const end = source.indexOf("]", index + 1)
      if (end === -1) throw new ExpressionError("Unclosed [column name]", index)
      tokens.push({ type: "column", value: source.slice(index + 1, end), position: index })
      index = end + 1
      continue
    }

    if (char === "'" || char === '"') {
      const quote = char
      let value = ""
      let cursor = index + 1
      let closed = false
      while (cursor < source.length) {
        if (source[cursor] === quote) {
          // A doubled quote is a literal quote, as in SQL.
          if (source[cursor + 1] === quote) {
            value += quote
            cursor += 2
            continue
          }
          closed = true
          break
        }
        value += source[cursor]
        cursor += 1
      }
      if (!closed) throw new ExpressionError("Unclosed string literal", index)
      tokens.push({ type: "string", value, position: index })
      index = cursor + 1
      continue
    }

    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(source[index + 1] ?? ""))) {
      let cursor = index
      while (cursor < source.length && /[0-9.]/.test(source[cursor])) cursor += 1
      const text = source.slice(index, cursor)
      if ((text.match(/\./g) ?? []).length > 1) throw new ExpressionError(`Invalid number: ${text}`, index)
      tokens.push({ type: "number", value: text, position: index })
      index = cursor
      continue
    }

    if (/[A-Za-z_]/.test(char)) {
      let cursor = index
      while (cursor < source.length && /[A-Za-z0-9_]/.test(source[cursor])) cursor += 1
      tokens.push({ type: "identifier", value: source.slice(index, cursor), position: index })
      index = cursor
      continue
    }

    if (char === "(") {
      tokens.push({ type: "lparen", value: char, position: index })
      index += 1
      continue
    }

    if (char === ")") {
      tokens.push({ type: "rparen", value: char, position: index })
      index += 1
      continue
    }

    if (char === ",") {
      tokens.push({ type: "comma", value: char, position: index })
      index += 1
      continue
    }

    const operator = OPERATORS.find((candidate) => source.startsWith(candidate, index))
    if (operator) {
      tokens.push({ type: "operator", value: operator, position: index })
      index += operator.length
      continue
    }

    throw new ExpressionError(`Unexpected character "${char}"`, index)
  }

  tokens.push({ type: "eof", value: "", position: source.length })
  return tokens
}

/* -------------------------------------------------------------------------- */
/* Syntax tree                                                                */
/* -------------------------------------------------------------------------- */

type Node =
  | { type: "literal"; value: ExpressionValue }
  | { type: "column"; name: string }
  | { type: "unary"; op: string; operand: Node }
  | { type: "binary"; op: string; left: Node; right: Node }
  | { type: "isnull"; operand: Node; negated: boolean }
  | { type: "in"; operand: Node; values: Node[]; negated: boolean }
  | { type: "call"; name: string; args: Node[] }
  | { type: "case"; branches: Array<{ when: Node; then: Node }>; otherwise: Node | null }

/** Keywords that behave as operators rather than as column references. */
const WORD_OPERATORS: Record<string, string> = {
  and: "AND",
  or: "OR",
  not: "NOT",
  like: "LIKE",
  ilike: "ILIKE",
  in: "IN",
  is: "IS",
}

const LITERAL_WORDS: Record<string, ExpressionValue> = {
  true: true,
  false: false,
  null: null,
}

class Parser {
  private index = 0

  constructor(private readonly tokens: Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)]
  }

  private next(): Token {
    const token = this.tokens[this.index]
    this.index += 1
    return token
  }

  private expect(type: TokenType, what: string): Token {
    const token = this.peek()
    if (token.type !== type) throw new ExpressionError(`Expected ${what} but found ${describe(token)}`, token.position)
    return this.next()
  }

  /** True when the current identifier is a keyword operator, e.g. `AND` or `LIKE`. */
  private wordOperator(offset = 0): string | null {
    const token = this.peek(offset)
    if (token.type !== "identifier") return null
    return WORD_OPERATORS[token.value.toLowerCase()] ?? null
  }

  parse(): Node {
    const node = this.parseOr()
    const trailing = this.peek()
    if (trailing.type !== "eof") {
      throw new ExpressionError(`Unexpected ${describe(trailing)} after the expression`, trailing.position)
    }
    return node
  }

  private parseOr(): Node {
    let left = this.parseAnd()
    while (this.wordOperator() === "OR") {
      this.next()
      left = { type: "binary", op: "OR", left, right: this.parseAnd() }
    }
    return left
  }

  private parseAnd(): Node {
    let left = this.parseNot()
    while (this.wordOperator() === "AND") {
      this.next()
      left = { type: "binary", op: "AND", left, right: this.parseNot() }
    }
    return left
  }

  private parseNot(): Node {
    if (this.wordOperator() === "NOT") {
      this.next()
      return { type: "unary", op: "NOT", operand: this.parseNot() }
    }
    return this.parseComparison()
  }

  private parseComparison(): Node {
    const left = this.parseAdditive()
    const token = this.peek()

    if (token.type === "operator" && ["=", "==", "!=", "<>", "<", "<=", ">", ">="].includes(token.value)) {
      this.next()
      return { type: "binary", op: token.value === "==" ? "=" : token.value === "<>" ? "!=" : token.value, left, right: this.parseAdditive() }
    }

    const word = this.wordOperator()
    if (word === "LIKE" || word === "ILIKE") {
      this.next()
      return { type: "binary", op: word, left, right: this.parseAdditive() }
    }

    if (word === "IN") {
      this.next()
      this.expect("lparen", "(")
      const values: Node[] = []
      if (this.peek().type !== "rparen") {
        values.push(this.parseOr())
        while (this.peek().type === "comma") {
          this.next()
          values.push(this.parseOr())
        }
      }
      this.expect("rparen", ")")
      return { type: "in", operand: left, values, negated: false }
    }

    if (word === "IS") {
      this.next()
      const negated = this.wordOperator() === "NOT" ? (this.next(), true) : false
      const token2 = this.peek()
      if (token2.type === "identifier" && token2.value.toLowerCase() === "null") {
        this.next()
        return { type: "isnull", operand: left, negated }
      }
      throw new ExpressionError("IS may only be followed by NULL or NOT NULL", token2.position)
    }

    if (word === "NOT") {
      // `x NOT LIKE y` and `x NOT IN (...)`
      const following = this.wordOperator(1)
      if (following === "LIKE" || following === "ILIKE") {
        this.next()
        this.next()
        return { type: "unary", op: "NOT", operand: { type: "binary", op: following, left, right: this.parseAdditive() } }
      }
      if (following === "IN") {
        this.next()
        this.next()
        this.expect("lparen", "(")
        const values: Node[] = []
        if (this.peek().type !== "rparen") {
          values.push(this.parseOr())
          while (this.peek().type === "comma") {
            this.next()
            values.push(this.parseOr())
          }
        }
        this.expect("rparen", ")")
        return { type: "in", operand: left, values, negated: true }
      }
    }

    return left
  }

  private parseAdditive(): Node {
    let left = this.parseMultiplicative()
    for (;;) {
      const token = this.peek()
      if (token.type !== "operator" || !["+", "-", "||"].includes(token.value)) return left
      this.next()
      left = { type: "binary", op: token.value, left, right: this.parseMultiplicative() }
    }
  }

  private parseMultiplicative(): Node {
    let left = this.parseUnary()
    for (;;) {
      const token = this.peek()
      if (token.type !== "operator" || !["*", "/", "%"].includes(token.value)) return left
      this.next()
      left = { type: "binary", op: token.value, left, right: this.parseUnary() }
    }
  }

  private parseUnary(): Node {
    const token = this.peek()
    if (token.type === "operator" && (token.value === "-" || token.value === "+")) {
      this.next()
      const operand = this.parseUnary()
      return token.value === "-" ? { type: "unary", op: "-", operand } : operand
    }
    if (this.wordOperator() === "NOT") {
      this.next()
      return { type: "unary", op: "NOT", operand: this.parseUnary() }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Node {
    const token = this.peek()

    if (token.type === "number") {
      this.next()
      return { type: "literal", value: Number(token.value) }
    }

    if (token.type === "string") {
      this.next()
      return { type: "literal", value: token.value }
    }

    if (token.type === "column") {
      this.next()
      return { type: "column", name: token.value }
    }

    if (token.type === "lparen") {
      this.next()
      const inner = this.parseOr()
      this.expect("rparen", ")")
      return inner
    }

    if (token.type === "identifier") {
      const lower = token.value.toLowerCase()

      if (lower === "case") {
        return this.parseCase()
      }

      if (lower in LITERAL_WORDS && this.peek(1).type !== "lparen") {
        this.next()
        return { type: "literal", value: LITERAL_WORDS[lower] }
      }

      if (this.peek(1).type === "lparen") {
        this.next()
        this.next()
        const args: Node[] = []
        if (this.peek().type !== "rparen") {
          args.push(this.parseOr())
          while (this.peek().type === "comma") {
            this.next()
            args.push(this.parseOr())
          }
        }
        this.expect("rparen", ")")
        return { type: "call", name: lower, args }
      }

      // A bare identifier is a column reference, so `region = 'EU'` works
      // without brackets whenever the header has no spaces.
      this.next()
      return { type: "column", name: token.value }
    }

    throw new ExpressionError(`Expected a value but found ${describe(token)}`, token.position)
  }

  private parseCase(): Node {
    this.next() // CASE
    const branches: Array<{ when: Node; then: Node }> = []

    while (this.peek().type === "identifier" && this.peek().value.toLowerCase() === "when") {
      this.next()
      const when = this.parseOr()
      const thenToken = this.peek()
      if (thenToken.type !== "identifier" || thenToken.value.toLowerCase() !== "then") {
        throw new ExpressionError("Expected THEN in CASE expression", thenToken.position)
      }
      this.next()
      branches.push({ when, then: this.parseOr() })
    }

    if (branches.length === 0) throw new ExpressionError("CASE needs at least one WHEN branch", this.peek().position)

    let otherwise: Node | null = null
    const elseToken = this.peek()
    if (elseToken.type === "identifier" && elseToken.value.toLowerCase() === "else") {
      this.next()
      otherwise = this.parseOr()
    }

    const endToken = this.peek()
    if (endToken.type !== "identifier" || endToken.value.toLowerCase() !== "end") {
      throw new ExpressionError("Expected END to close the CASE expression", endToken.position)
    }
    this.next()

    return { type: "case", branches, otherwise }
  }
}

function describe(token: Token): string {
  if (token.type === "eof") return "the end of the expression"
  if (token.type === "string") return `the text "${token.value}"`
  return `"${token.value}"`
}

/* -------------------------------------------------------------------------- */
/* Values                                                                     */
/* -------------------------------------------------------------------------- */

/** Null-safe coercion to text, matching what the grid shows for a cell. */
export function toText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

/** Null-safe coercion to a number; anything unparseable becomes null. */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "boolean") return value ? 1 : 0
  if (value instanceof Date) return value.getTime()
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function toBooleanValue(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  const text = String(value).trim().toLowerCase()
  if (["true", "yes", "y", "1"].includes(text)) return true
  if (["false", "no", "n", "0"].includes(text)) return false
  return null
}

/** What a filter expression means by "true". Null and empty text are false. */
export function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  return true
}

function likeToRegExp(pattern: string, caseInsensitive: boolean): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const body = escaped.replace(/%/g, ".*").replace(/_/g, ".")
  return new RegExp(`^${body}$`, caseInsensitive ? "i" : "")
}

/** Comparable form for ordering and equality across mixed column types. */
function compareValues(left: unknown, right: unknown): number {
  const leftNumber = toNumber(left)
  const rightNumber = toNumber(right)
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber

  const leftBoolean = toBooleanValue(left)
  const rightBoolean = toBooleanValue(right)
  if (leftBoolean !== null && rightBoolean !== null) return leftBoolean === rightBoolean ? 0 : leftBoolean ? 1 : -1

  return toText(left).localeCompare(toText(right))
}

function equals(left: unknown, right: unknown): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    return (left ?? null) === (right ?? null)
  }
  if (typeof left === "boolean" || typeof right === "boolean") {
    const a = toBooleanValue(left)
    const b = toBooleanValue(right)
    return a !== null && b !== null && a === b
  }
  const a = toNumber(left)
  const b = toNumber(right)
  if (a !== null && b !== null) return a === b
  return toText(left) === toText(right)
}

/* -------------------------------------------------------------------------- */
/* Functions                                                                  */
/* -------------------------------------------------------------------------- */

type FunctionImpl = (args: unknown[]) => ExpressionValue

function requireArgs(name: string, args: unknown[], min: number, max = min): void {
  if (args.length < min || args.length > max) {
    const expected = min === max ? `${min}` : `${min}-${max}`
    throw new Error(`${name.toUpperCase()} expects ${expected} argument${max === 1 ? "" : "s"} but got ${args.length}`)
  }
}

/** `REGEX_*` functions take a raw pattern from the user; a bad one is an error, not a crash. */
function regex(pattern: unknown, flags = ""): RegExp {
  try {
    return new RegExp(toText(pattern), flags)
  } catch (error) {
    throw new Error(`Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const FUNCTIONS: Record<string, FunctionImpl> = {
  /* text */
  upper: (args) => (requireArgs("upper", args, 1), toText(args[0]).toUpperCase()),
  lower: (args) => (requireArgs("lower", args, 1), toText(args[0]).toLowerCase()),
  trim: (args) => (requireArgs("trim", args, 1), toText(args[0]).trim()),
  ltrim: (args) => (requireArgs("ltrim", args, 1), toText(args[0]).replace(/^\s+/, "")),
  rtrim: (args) => (requireArgs("rtrim", args, 1), toText(args[0]).replace(/\s+$/, "")),
  len: (args) => (requireArgs("len", args, 1), toText(args[0]).length),
  left: (args) => (requireArgs("left", args, 2), toText(args[0]).slice(0, Math.max(0, toNumber(args[1]) ?? 0))),
  right: (args) => {
    requireArgs("right", args, 2)
    const count = Math.max(0, toNumber(args[1]) ?? 0)
    const text = toText(args[0])
    return count === 0 ? "" : text.slice(-count)
  },
  substr: (args) => {
    requireArgs("substr", args, 2, 3)
    const text = toText(args[0])
    const start = Math.trunc(toNumber(args[1]) ?? 0)
    if (args.length === 2) return text.slice(start)
    return text.substr(start, Math.max(0, Math.trunc(toNumber(args[2]) ?? 0)))
  },
  concat: (args) => args.map(toText).join(""),
  contains: (args) => (requireArgs("contains", args, 2), toText(args[0]).includes(toText(args[1]))),
  startswith: (args) => (requireArgs("startswith", args, 2), toText(args[0]).startsWith(toText(args[1]))),
  endswith: (args) => (requireArgs("endswith", args, 2), toText(args[0]).endsWith(toText(args[1]))),
  replace: (args) => {
    requireArgs("replace", args, 3)
    return toText(args[0]).split(toText(args[1])).join(toText(args[2]))
  },
  split: (args) => {
    requireArgs("split", args, 3)
    const parts = toText(args[0]).split(toText(args[1]))
    return parts[Math.trunc(toNumber(args[2]) ?? 0)] ?? null
  },
  regex_match: (args) => (requireArgs("regex_match", args, 2), regex(args[1]).test(toText(args[0]))),
  regex_replace: (args) => (requireArgs("regex_replace", args, 3), toText(args[0]).replace(regex(args[1], "g"), toText(args[2]))),
  regex_extract: (args) => {
    requireArgs("regex_extract", args, 2)
    const match = regex(args[1]).exec(toText(args[0]))
    return match ? (match[1] ?? match[0]) : null
  },

  /* numbers */
  abs: (args) => (requireArgs("abs", args, 1), nullableNumber(args[0], Math.abs)),
  round: (args) => {
    requireArgs("round", args, 1, 2)
    const digits = args.length === 2 ? Math.trunc(toNumber(args[1]) ?? 0) : 0
    const factor = 10 ** digits
    return nullableNumber(args[0], (value) => Math.round(value * factor) / factor)
  },
  floor: (args) => (requireArgs("floor", args, 1), nullableNumber(args[0], Math.floor)),
  ceil: (args) => (requireArgs("ceil", args, 1), nullableNumber(args[0], Math.ceil)),
  sqrt: (args) => (requireArgs("sqrt", args, 1), nullableNumber(args[0], (value) => (value < 0 ? NaN : Math.sqrt(value)))),
  pow: (args) => (requireArgs("pow", args, 2), nullableNumber(args[0], (value) => value ** (toNumber(args[1]) ?? 0))),
  sign: (args) => (requireArgs("sign", args, 1), nullableNumber(args[0], Math.sign)),
  min: (args) => (args.length === 0 ? null : args.reduce((best, value) => (compareValues(value, best) < 0 ? value : best)) as ExpressionValue),
  max: (args) => (args.length === 0 ? null : args.reduce((best, value) => (compareValues(value, best) > 0 ? value : best)) as ExpressionValue),

  /* null and logic */
  coalesce: (args) => {
    for (const value of args) {
      if (value !== null && value !== undefined && value !== "") return value as ExpressionValue
    }
    return null
  },
  if: (args) => (requireArgs("if", args, 3), isTruthy(args[0]) ? (args[1] as ExpressionValue) : (args[2] as ExpressionValue)),
  ifnull: (args) => (requireArgs("ifnull", args, 2), args[0] === null || args[0] === undefined || args[0] === "" ? (args[1] as ExpressionValue) : (args[0] as ExpressionValue)),
  nullif: (args) => (requireArgs("nullif", args, 2), equals(args[0], args[1]) ? null : (args[0] as ExpressionValue)),
  isblank: (args) => (requireArgs("isblank", args, 1), args[0] === null || args[0] === undefined || toText(args[0]).trim() === ""),
  isnumber: (args) => (requireArgs("isnumber", args, 1), toNumber(args[0]) !== null),
  isdate: (args) => (requireArgs("isdate", args, 1), toDateValue(args[0]) !== null),

  /* conversions */
  number: (args) => (requireArgs("number", args, 1), toNumber(args[0])),
  text: (args) => (requireArgs("text", args, 1), toText(args[0])),
  boolean: (args) => (requireArgs("boolean", args, 1), toBooleanValue(args[0])),

  /* dates */
  date: (args) => {
    requireArgs("date", args, 1)
    const parsed = toDateValue(args[0])
    return parsed ? parsed.toISOString().slice(0, 10) : null
  },
  year: (args) => (requireArgs("year", args, 1), datePart(args[0], (date) => date.getUTCFullYear())),
  month: (args) => (requireArgs("month", args, 1), datePart(args[0], (date) => date.getUTCMonth() + 1)),
  day: (args) => (requireArgs("day", args, 1), datePart(args[0], (date) => date.getUTCDate())),
  hour: (args) => (requireArgs("hour", args, 1), datePart(args[0], (date) => date.getUTCHours())),
  minute: (args) => (requireArgs("minute", args, 1), datePart(args[0], (date) => date.getUTCMinutes())),
  datediff: (args) => {
    requireArgs("datediff", args, 2)
    const left = toDateValue(args[0])
    const right = toDateValue(args[1])
    if (!left || !right) return null
    return Math.round((left.getTime() - right.getTime()) / 86_400_000)
  },
  now: (args) => (requireArgs("now", args, 0), new Date().toISOString().slice(0, 19).replace("T", " ")),
}

function nullableNumber(value: unknown, apply: (value: number) => number): ExpressionValue {
  const parsed = toNumber(value)
  if (parsed === null) return null
  const result = apply(parsed)
  return Number.isFinite(result) ? result : null
}

function datePart(value: unknown, part: (date: Date) => number): ExpressionValue {
  const parsed = toDateValue(value)
  return parsed ? part(parsed) : null
}

/** Accepts Date objects, ISO-ish text and `YYYY-MM-DD`; bare numbers are not dates. */
function toDateValue(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === "number") return null
  const text = String(value).trim()
  if (!/^\d{4}-\d{2}-\d{2}/.test(text)) return null
  const parsed = new Date(text.replace(" ", "T"))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Signature list for the expression help panel. Kept next to the implementation. */
export const EXPRESSION_FUNCTIONS: Array<{ name: string; signature: string; description: string; group: string }> = [
  { name: "upper", signature: "UPPER(text)", description: "Uppercases text.", group: "Text" },
  { name: "lower", signature: "LOWER(text)", description: "Lowercases text.", group: "Text" },
  { name: "trim", signature: "TRIM(text)", description: "Strips leading and trailing spaces.", group: "Text" },
  { name: "len", signature: "LEN(text)", description: "Number of characters.", group: "Text" },
  { name: "left", signature: "LEFT(text, n)", description: "First n characters.", group: "Text" },
  { name: "right", signature: "RIGHT(text, n)", description: "Last n characters.", group: "Text" },
  { name: "substr", signature: "SUBSTR(text, start, length?)", description: "Substring from a zero-based start.", group: "Text" },
  { name: "concat", signature: "CONCAT(a, b, …)", description: "Joins values as text.", group: "Text" },
  { name: "contains", signature: "CONTAINS(text, part)", description: "True when text contains part.", group: "Text" },
  { name: "startswith", signature: "STARTSWITH(text, prefix)", description: "True when text starts with prefix.", group: "Text" },
  { name: "endswith", signature: "ENDSWITH(text, suffix)", description: "True when text ends with suffix.", group: "Text" },
  { name: "replace", signature: "REPLACE(text, find, with)", description: "Replaces every occurrence.", group: "Text" },
  { name: "split", signature: "SPLIT(text, sep, index)", description: "One part of a separated string.", group: "Text" },
  { name: "regex_match", signature: "REGEX_MATCH(text, pattern)", description: "True when the pattern matches.", group: "Text" },
  { name: "regex_replace", signature: "REGEX_REPLACE(text, pattern, with)", description: "Regex replace, all occurrences.", group: "Text" },
  { name: "regex_extract", signature: "REGEX_EXTRACT(text, pattern)", description: "First capture group, or null.", group: "Text" },
  { name: "abs", signature: "ABS(n)", description: "Absolute value.", group: "Number" },
  { name: "round", signature: "ROUND(n, digits?)", description: "Rounds to n decimal places.", group: "Number" },
  { name: "floor", signature: "FLOOR(n)", description: "Rounds down.", group: "Number" },
  { name: "ceil", signature: "CEIL(n)", description: "Rounds up.", group: "Number" },
  { name: "sqrt", signature: "SQRT(n)", description: "Square root.", group: "Number" },
  { name: "pow", signature: "POW(n, exponent)", description: "n raised to a power.", group: "Number" },
  { name: "sign", signature: "SIGN(n)", description: "-1, 0 or 1.", group: "Number" },
  { name: "min", signature: "MIN(a, b, …)", description: "Smallest of the values.", group: "Number" },
  { name: "max", signature: "MAX(a, b, …)", description: "Largest of the values.", group: "Number" },
  { name: "coalesce", signature: "COALESCE(a, b, …)", description: "First value that is not blank.", group: "Logic" },
  { name: "if", signature: "IF(condition, then, else)", description: "Chooses between two values.", group: "Logic" },
  { name: "ifnull", signature: "IFNULL(value, fallback)", description: "Fallback when the value is blank.", group: "Logic" },
  { name: "nullif", signature: "NULLIF(a, b)", description: "Null when a equals b.", group: "Logic" },
  { name: "isblank", signature: "ISBLANK(value)", description: "True when the cell is empty.", group: "Logic" },
  { name: "isnumber", signature: "ISNUMBER(value)", description: "True when the value parses as a number.", group: "Logic" },
  { name: "isdate", signature: "ISDATE(value)", description: "True when the value is a date.", group: "Logic" },
  { name: "number", signature: "NUMBER(value)", description: "Coerces to a number, or null.", group: "Conversion" },
  { name: "text", signature: "TEXT(value)", description: "Coerces to text.", group: "Conversion" },
  { name: "boolean", signature: "BOOLEAN(value)", description: "Coerces to true/false, or null.", group: "Conversion" },
  { name: "date", signature: "DATE(value)", description: "Formats as YYYY-MM-DD.", group: "Date" },
  { name: "year", signature: "YEAR(date)", description: "Calendar year.", group: "Date" },
  { name: "month", signature: "MONTH(date)", description: "Month number, 1-12.", group: "Date" },
  { name: "day", signature: "DAY(date)", description: "Day of month.", group: "Date" },
  { name: "hour", signature: "HOUR(date)", description: "Hour, 0-23.", group: "Date" },
  { name: "minute", signature: "MINUTE(date)", description: "Minute, 0-59.", group: "Date" },
  { name: "datediff", signature: "DATEDIFF(a, b)", description: "Whole days from b to a.", group: "Date" },
  { name: "now", signature: "NOW()", description: "Current timestamp.", group: "Date" },
]

/* -------------------------------------------------------------------------- */
/* Compilation and evaluation                                                 */
/* -------------------------------------------------------------------------- */

export interface CompiledExpression {
  source: string
  /** Column names the expression reads, in the case the caller supplied. */
  columns: string[]
  evaluate(row: unknown[]): ExpressionValue
}

interface CompiledNode {
  (row: unknown[]): unknown
}

function compileNode(node: Node, indexOf: (name: string) => number | undefined): CompiledNode {
  switch (node.type) {
    case "literal":
      return () => node.value

    case "column": {
      const index = indexOf(node.name)
      if (index === undefined) throw new ExpressionError(`Unknown column "${node.name}"`, 0)
      return (row) => row[index]
    }

    case "unary": {
      const operand = compileNode(node.operand, indexOf)
      if (node.op === "NOT") return (row) => !isTruthy(operand(row))
      return (row) => {
        const value = toNumber(operand(row))
        return value === null ? null : -value
      }
    }

    case "isnull": {
      const operand = compileNode(node.operand, indexOf)
      return (row) => {
        const value = operand(row)
        const blank = value === null || value === undefined || value === ""
        return node.negated ? !blank : blank
      }
    }

    case "in": {
      const operand = compileNode(node.operand, indexOf)
      const values = node.values.map((value) => compileNode(value, indexOf))
      return (row) => {
        const value = operand(row)
        const found = values.some((candidate) => equals(value, candidate(row)))
        return node.negated ? !found : found
      }
    }

    case "binary": {
      const left = compileNode(node.left, indexOf)
      const right = compileNode(node.right, indexOf)

      switch (node.op) {
        case "AND":
          return (row) => isTruthy(left(row)) && isTruthy(right(row))
        case "OR":
          return (row) => isTruthy(left(row)) || isTruthy(right(row))
        case "=":
          return (row) => equals(left(row), right(row))
        case "!=":
          return (row) => !equals(left(row), right(row))
        case "<":
          return (row) => compareNullable(left(row), right(row), (result) => result < 0)
        case "<=":
          return (row) => compareNullable(left(row), right(row), (result) => result <= 0)
        case ">":
          return (row) => compareNullable(left(row), right(row), (result) => result > 0)
        case ">=":
          return (row) => compareNullable(left(row), right(row), (result) => result >= 0)
        case "LIKE":
          return (row) => likeToRegExp(toText(right(row)), false).test(toText(left(row)))
        case "ILIKE":
          return (row) => likeToRegExp(toText(right(row)), true).test(toText(left(row)))
        case "||":
          return (row) => toText(left(row)) + toText(right(row))
        case "+":
        case "-":
        case "*":
        case "/":
        case "%":
          return (row) => arithmetic(node.op, left(row), right(row))
        default:
          throw new ExpressionError(`Unsupported operator ${node.op}`, 0)
      }
    }

    case "case": {
      const branches = node.branches.map((branch) => ({
        when: compileNode(branch.when, indexOf),
        then: compileNode(branch.then, indexOf),
      }))
      const otherwise = node.otherwise ? compileNode(node.otherwise, indexOf) : null
      return (row) => {
        for (const branch of branches) {
          if (isTruthy(branch.when(row))) return branch.then(row)
        }
        return otherwise ? otherwise(row) : null
      }
    }

    case "call": {
      const name = node.name
      const impl = FUNCTIONS[name]
      if (!impl) throw new ExpressionError(`Unknown function "${node.name.toUpperCase()}"`, 0)
      const args = node.args.map((arg) => compileNode(arg, indexOf))
      return (row) => impl(args.map((arg) => arg(row)))
    }
  }
}

function compareNullable(left: unknown, right: unknown, test: (result: number) => boolean): boolean {
  if (left === null || left === undefined || right === null || right === undefined) return false
  if (toText(left) === "" || toText(right) === "") return false
  return test(compareValues(left, right))
}

function arithmetic(op: string, left: unknown, right: unknown): ExpressionValue {
  const a = toNumber(left)
  const b = toNumber(right)
  if (a === null || b === null) return null
  switch (op) {
    case "+":
      return a + b
    case "-":
      return a - b
    case "*":
      return a * b
    case "/":
      return b === 0 ? null : a / b
    case "%":
      return b === 0 ? null : a % b
    default:
      return null
  }
}

/** Column lookup is case-insensitive and ignores surrounding spaces. */
function columnIndexer(columns: string[]): (name: string) => number | undefined {
  const lookup = new Map<string, number>()
  columns.forEach((column, index) => {
    lookup.set(column.toLowerCase(), index)
    lookup.set(column.trim().toLowerCase(), index)
  })
  return (name) => lookup.get(name.toLowerCase()) ?? lookup.get(name.trim().toLowerCase())
}

function referencedColumns(node: Node, indexOf: (name: string) => number | undefined, into: Set<number>): void {
  switch (node.type) {
    case "column": {
      const index = indexOf(node.name)
      if (index !== undefined) into.add(index)
      return
    }
    case "unary":
      referencedColumns(node.operand, indexOf, into)
      return
    case "isnull":
      referencedColumns(node.operand, indexOf, into)
      return
    case "in":
      referencedColumns(node.operand, indexOf, into)
      node.values.forEach((value) => referencedColumns(value, indexOf, into))
      return
    case "binary":
      referencedColumns(node.left, indexOf, into)
      referencedColumns(node.right, indexOf, into)
      return
    case "case":
      node.branches.forEach((branch) => {
        referencedColumns(branch.when, indexOf, into)
        referencedColumns(branch.then, indexOf, into)
      })
      if (node.otherwise) referencedColumns(node.otherwise, indexOf, into)
      return
    case "call":
      node.args.forEach((arg) => referencedColumns(arg, indexOf, into))
      return
    default:
  }
}

/**
 * Parses and compiles an expression against a column list. Throws
 * `ExpressionError` with a message that is safe to show to the user.
 */
export function compileExpression(source: string, columns: string[]): CompiledExpression {
  const trimmed = source.trim()
  if (!trimmed) throw new ExpressionError("The expression is empty", 0)

  const ast = new Parser(tokenize(trimmed)).parse()
  const indexOf = columnIndexer(columns)
  const evaluate = compileNode(ast, indexOf)

  const used = new Set<number>()
  referencedColumns(ast, indexOf, used)

  return {
    source: trimmed,
    columns: [...used].sort((a, b) => a - b).map((index) => columns[index]),
    evaluate: (row) => {
      const value = evaluate(row)
      if (value === null || value === undefined) return null
      if (value instanceof Date) return value.toISOString()
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
      return String(value)
    },
  }
}

export function validateExpression(
  source: string,
  columns: string[],
): { ok: true; columns: string[] } | { ok: false; error: string } {
  try {
    return { ok: true, columns: compileExpression(source, columns).columns }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function evaluateExpression(source: string, columns: string[], row: unknown[]): ExpressionValue {
  return compileExpression(source, columns).evaluate(row)
}
