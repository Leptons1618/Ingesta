import { insertData } from "@/lib/db"
import { jsonRoute } from "@/lib/http"
import type { DatabaseConfig } from "@/lib/types"

export async function POST(request: Request) {
  const { config, tableName, columnNames, data } = (await request.json()) as {
    config: DatabaseConfig
    tableName: string
    columnNames: string[]
    data: unknown[][]
  }
  return jsonRoute(() => insertData(config, tableName, columnNames, data))
}
