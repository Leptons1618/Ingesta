import { NextResponse } from "next/server"

import { errorMessage } from "@/lib/utils"

/**
 * A failure that still has something to report. Thrown when a route failed but
 * its caller needs the numbers: a partial insert knows how many rows landed, and
 * "1 of 9 batches failed" is only useful alongside "4,000 rows were written".
 */
export class RouteFailure<T extends object> extends Error {
  constructor(
    message: string,
    readonly detail: T,
  ) {
    super(message)
    this.name = "RouteFailure"
  }
}

/**
 * Route handlers all answer `{ success: true, ...payload }`, or
 * `{ success: false, message }` with a 500 when something throws. A thrown
 * `RouteFailure` adds its detail to the failure body.
 */
export async function jsonRoute<T extends object>(run: () => Promise<T>) {
  try {
    return NextResponse.json({ success: true, ...(await run()) })
  } catch (error) {
    if (error instanceof RouteFailure) {
      return NextResponse.json(
        { success: false, message: error.message, ...error.detail },
        { status: 500 },
      )
    }
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 })
  }
}

/** Parse a JSON request body and keep malformed input on the standard error path. */
export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new Error("Request body must be valid JSON")
  }
}

/** Reject unknown values before a route can fall through to a destructive default. */
export function assertOneOf<const T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`Invalid ${label}; expected one of: ${allowed.join(", ")}`)
  }
  return value as T[number]
}
