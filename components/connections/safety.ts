import { api } from "@/lib/api"
import type { DatabaseConfig } from "@/lib/types"

/**
 * The guardrail setting promises a copy of a table before a destructive change.
 * A copy that cannot be taken refuses the change instead of quietly running it
 * unprotected — a promise the settings page makes is not one this page breaks.
 */
export async function takeSafetySnapshot(
  config: DatabaseConfig,
  tableName: string,
  enabled: boolean,
  maxSnapshots?: number,
): Promise<{ ok: true; note: string } | { ok: false; error: string }> {
  if (!enabled) return { ok: true, note: "" }

  const result = await api.createSnapshot(config, tableName, undefined, maxSnapshots)
  if (!result.ok) {
    return { ok: false, error: `No safety snapshot could be taken, so nothing was changed: ${result.error}` }
  }

  return { ok: true, note: ` A safety snapshot (${result.data.name}) was taken first.` }
}
