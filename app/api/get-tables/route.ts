import { getTables } from "@/lib/db"
import { jsonRoute, readJson } from "@/lib/http"
import type { DatabaseConfig } from "@/lib/types"

export async function POST(request: Request) {
  return jsonRoute(async () => ({ tables: await getTables(await readJson<DatabaseConfig>(request)) }))
}
