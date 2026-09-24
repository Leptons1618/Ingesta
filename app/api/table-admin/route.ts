import { alterTable, dropTable, truncateTable } from "@/lib/db"
import { assertOneOf, jsonRoute, readJson } from "@/lib/http"
import type { DatabaseConfig } from "@/lib/types"

const TABLE_ADMIN_ACTIONS = ["drop", "truncate", "rename"] as const

/** Dropping, emptying and renaming are the three whole-table operations. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const { config, tableName, action, to } = await readJson<{
      config: DatabaseConfig
      tableName: string
      action: (typeof TABLE_ADMIN_ACTIONS)[number]
      to?: string
    }>(request)
    const validAction = assertOneOf(action, TABLE_ADMIN_ACTIONS, "table action")

    if (validAction === "drop") {
      await dropTable(config, tableName)
      return { message: `Table "${tableName}" dropped` }
    }

    if (validAction === "truncate") return truncateTable(config, tableName)

    if (!to?.trim()) throw new Error("A rename needs the new table name")
    return alterTable(config, tableName, { action: "rename-table", to })
  })
}
