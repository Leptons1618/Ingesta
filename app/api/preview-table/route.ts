import { previewTable } from "@/lib/db"
import { jsonRoute } from "@/lib/http"
import type { DatabaseConfig, SortDirection } from "@/lib/types"

export async function POST(request: Request) {
  const { config, tableName, limit, offset, orderBy, direction } = (await request.json()) as {
    config: DatabaseConfig
    tableName: string
    limit?: number
    offset?: number
    orderBy?: string
    direction?: SortDirection
  }
  return jsonRoute(() => previewTable(config, tableName, { limit, offset, orderBy, direction }))
}
