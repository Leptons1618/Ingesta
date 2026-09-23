import { alterTable } from "@/lib/db"
import { jsonRoute } from "@/lib/http"
import type { AlterAction, DatabaseConfig } from "@/lib/types"

export async function POST(request: Request) {
  const { config, tableName, change } = (await request.json()) as {
    config: DatabaseConfig
    tableName: string
    change: AlterAction
  }
  return jsonRoute(() => alterTable(config, tableName, change))
}
