import { listDatabases } from "@/lib/db"
import { jsonRoute } from "@/lib/http"
import type { ServerOptions } from "@/lib/types"

export async function POST(request: Request) {
  const { config } = (await request.json()) as { config: ServerOptions }
  return jsonRoute(async () => ({ databases: await listDatabases(config) }))
}
