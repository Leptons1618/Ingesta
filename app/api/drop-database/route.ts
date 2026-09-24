import { dropDatabase } from "@/lib/db"
import { jsonRoute, readJson } from "@/lib/http"
import type { ServerOptions } from "@/lib/types"

export async function POST(request: Request) {
  return jsonRoute(async () => {
    const { config, databaseName } = await readJson<{ config: ServerOptions; databaseName: string }>(request)
    await dropDatabase(config, databaseName)
    return { message: `Database "${databaseName.trim()}" dropped` }
  })
}
