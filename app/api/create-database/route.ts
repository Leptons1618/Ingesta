import { createDatabase } from "@/lib/db"
import { jsonRoute } from "@/lib/http"
import type { ServerOptions } from "@/lib/types"

export async function POST(request: Request) {
  const { config, databaseName } = (await request.json()) as { config: ServerOptions; databaseName: string }
  return jsonRoute(async () => {
    await createDatabase(config, databaseName)
    return { message: `Database "${databaseName.trim()}" created` }
  })
}
