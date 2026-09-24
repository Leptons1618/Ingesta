import { testConnection } from "@/lib/db"
import { jsonRoute, readJson } from "@/lib/http"
import type { DatabaseConfig } from "@/lib/types"

export async function POST(request: Request) {
  return jsonRoute(async () => testConnection(await readJson<DatabaseConfig>(request)))
}
