import { NextResponse } from "next/server"

import { errorMessage } from "@/lib/utils"

/**
 * Route handlers all answer `{ success: true, ...payload }`, or
 * `{ success: false, message }` with a 500 when something throws.
 */
export async function jsonRoute<T extends object>(run: () => Promise<T>) {
  try {
    return NextResponse.json({ success: true, ...(await run()) })
  } catch (error) {
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 })
  }
}
