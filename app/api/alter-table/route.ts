import { alterTable } from "@/lib/db"
import { assertOneOf, jsonRoute, readJson } from "@/lib/http"
import type { AlterAction, DatabaseConfig } from "@/lib/types"

const ALTER_ACTIONS = ["add-column", "drop-column", "rename-column", "change-type", "rename-table"] as const

export async function POST(request: Request) {
  return jsonRoute(async () => {
    const { config, tableName, change } = await readJson<{ config: DatabaseConfig; tableName: string; change: AlterAction }>(request)
    assertOneOf(change?.action, ALTER_ACTIONS, "alter action")
    return alterTable(config, tableName, change)
  })
}
