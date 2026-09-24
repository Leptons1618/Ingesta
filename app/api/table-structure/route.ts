import { getTableStructure } from "@/lib/db"
import { jsonRoute, readJson } from "@/lib/http"
import type { DatabaseConfig } from "@/lib/types"

export async function POST(request: Request) {
  return jsonRoute(async () => {
    const { config, tableName } = await readJson<{ config: DatabaseConfig; tableName: string }>(request)
    return { columns: await getTableStructure(config, tableName) }
  })
}
