import { copyTable } from "@/lib/db"
import { assertOneOf, jsonRoute, readJson } from "@/lib/http"
import type { DatabaseConfig } from "@/lib/types"

const COPY_MODES = ["create", "append", "replace"] as const

export async function POST(request: Request) {
  return jsonRoute(async () => {
    const { config, source, target, mode } = await readJson<{ config: DatabaseConfig; source: string; target: string; mode: (typeof COPY_MODES)[number] }>(request)
    assertOneOf(mode, COPY_MODES, "copy mode")
    return copyTable(config, source, target, mode)
  })
}
