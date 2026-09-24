import { createTable } from "@/lib/db"
import { jsonRoute, readJson } from "@/lib/http"
import type { DatabaseConfig, TableCreationConfig } from "@/lib/types"

export async function POST(request: Request) {
  return jsonRoute(async () => {
    const { config, tableConfig } = await readJson<{ config: DatabaseConfig; tableConfig: TableCreationConfig }>(request)
    await createTable(config, tableConfig)
    return { message: `Table "${tableConfig.tableName}" created` }
  })
}
