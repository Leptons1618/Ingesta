import { getTableStructure } from "@/lib/db"
import { jsonRoute } from "@/lib/http"
import type { DatabaseConfig } from "@/lib/types"

export async function POST(request: Request) {
  const { config, tableName } = (await request.json()) as { config: DatabaseConfig; tableName: string }
  return jsonRoute(async () => ({ columns: await getTableStructure(config, tableName) }))
}
