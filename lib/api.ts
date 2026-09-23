import { errorMessage } from "@/lib/utils"

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Every API route answers with `{ success, ... }`. This turns both transport
 * failures and `success: false` payloads into one shape the UI can render.
 */
export async function postJson<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const payload = (await response.json().catch(() => null)) as (T & { success?: boolean; message?: string }) | null

    if (!payload) return { ok: false, error: `Request to ${path} failed (${response.status})` }
    if (!response.ok || payload.success === false) {
      return { ok: false, error: payload.message ?? `Request to ${path} failed (${response.status})` }
    }

    return { ok: true, data: payload }
  } catch (error) {
    return { ok: false, error: errorMessage(error) }
  }
}
