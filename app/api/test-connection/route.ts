import { testConnection } from "@/lib/db"
import { jsonRoute } from "@/lib/http"
import type { DatabaseConfig } from "@/lib/types"

export async function POST(request: Request) {
  const config = (await request.json()) as DatabaseConfig
  return jsonRoute(() => testConnection(config))
}
