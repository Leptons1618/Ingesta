import { copyTable } from "@/lib/db"
import { jsonRoute } from "@/lib/http"
import type { DatabaseConfig } from "@/lib/types"

export async function POST(request: Request) {
  const { config, source, target, mode } = (await request.json()) as {
    config: DatabaseConfig
    source: string
    target: string
    mode: "create" | "append" | "replace"
  }
  return jsonRoute(() => copyTable(config, source, target, mode))
}
