import { previewTable } from "@/lib/db"
import { jsonRoute, readJson } from "@/lib/http"
import type { DatabaseConfig, SortDirection } from "@/lib/types"

export async function POST(request: Request) {
  return jsonRoute(async () => {
    const { config, tableName, limit, offset, orderBy, direction } = await readJson<{
      config: DatabaseConfig
      tableName: string
      limit?: number
      offset?: number
      orderBy?: string
      direction?: SortDirection
    }>(request)
    return previewTable(config, tableName, { limit, offset, orderBy, direction })
  })
}
