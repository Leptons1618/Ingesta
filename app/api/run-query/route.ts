import { runQuery } from "@/lib/db"
import { jsonRoute } from "@/lib/http"
import type { DatabaseConfig } from "@/lib/types"

export async function POST(request: Request) {
  const { config, sql, maxRows, allowWrite } = (await request.json()) as {
    config: DatabaseConfig
    sql: string
    maxRows?: number
    allowWrite?: boolean
  }
  return jsonRoute(() => runQuery(config, sql, { maxRows, allowWrite }))
}
