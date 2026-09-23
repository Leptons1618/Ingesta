import { mutateRows } from "@/lib/db"
import { jsonRoute } from "@/lib/http"
import type { DatabaseConfig, RowMutation } from "@/lib/types"

export async function POST(request: Request) {
  const { config, tableName, mutation } = (await request.json()) as {
    config: DatabaseConfig
    tableName: string
    mutation: RowMutation
  }
  return jsonRoute(() => mutateRows(config, tableName, mutation))
}
