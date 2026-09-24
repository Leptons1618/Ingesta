import { mutateRows } from "@/lib/db"
import { assertOneOf, jsonRoute, readJson } from "@/lib/http"
import type { DatabaseConfig, RowMutation } from "@/lib/types"

const ROW_ACTIONS = ["insert", "update", "delete"] as const

export async function POST(request: Request) {
  return jsonRoute(async () => {
    const { config, tableName, mutation } = await readJson<{ config: DatabaseConfig; tableName: string; mutation: RowMutation }>(request)
    assertOneOf(mutation?.action, ROW_ACTIONS, "row mutation")
    return mutateRows(config, tableName, mutation)
  })
}
