import { createTable } from "@/lib/db"
import { jsonRoute } from "@/lib/http"
import type { DatabaseConfig, TableCreationConfig } from "@/lib/types"

export async function POST(request: Request) {
  const { config, tableConfig } = (await request.json()) as {
    config: DatabaseConfig
    tableConfig: TableCreationConfig
  }
  return jsonRoute(async () => {
    await createTable(config, tableConfig)
    return { message: `Table "${tableConfig.tableName}" created` }
  })
}
