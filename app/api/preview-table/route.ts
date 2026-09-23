import { previewTable } from "@/lib/db"
import { jsonRoute } from "@/lib/http"
import type { DatabaseConfig } from "@/lib/types"

export async function POST(request: Request) {
  const { config, tableName, limit } = (await request.json()) as {
    config: DatabaseConfig
    tableName: string
    limit?: number
  }
  return jsonRoute(() => previewTable(config, tableName, limit ?? 10))
}
