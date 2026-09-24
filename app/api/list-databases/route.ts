import { listDatabases } from "@/lib/db"
import { jsonRoute, readJson } from "@/lib/http"
import type { ServerOptions } from "@/lib/types"

export async function POST(request: Request) {
  return jsonRoute(async () => {
    const { config } = await readJson<{ config: ServerOptions }>(request)
    return { databases: await listDatabases(config) }
  })
}
