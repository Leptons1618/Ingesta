import { runQuery } from "@/lib/db"
import { jsonRoute, readJson } from "@/lib/http"
import type { DatabaseConfig } from "@/lib/types"

export async function POST(request: Request) {
  return jsonRoute(async () => {
    const { config, sql, maxRows, allowWrite } = await readJson<{ config: DatabaseConfig; sql: string; maxRows?: number; allowWrite?: boolean }>(request)
    return runQuery(config, sql, { maxRows, allowWrite })
  })
}
