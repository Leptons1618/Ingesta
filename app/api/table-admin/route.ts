import { alterTable, dropTable, truncateTable } from "@/lib/db"
import { jsonRoute } from "@/lib/http"
import type { DatabaseConfig } from "@/lib/types"

/** Dropping, emptying and renaming are the three whole-table operations. */
export async function POST(request: Request) {
  const { config, tableName, action, to } = (await request.json()) as {
    config: DatabaseConfig
    tableName: string
    action: "drop" | "truncate" | "rename"
    to?: string
  }

  return jsonRoute(async () => {
    if (action === "drop") {
      await dropTable(config, tableName)
      return { message: `Table "${tableName}" dropped` }
    }

    if (action === "truncate") return truncateTable(config, tableName)

    if (!to?.trim()) throw new Error("A rename needs the new table name")
    return alterTable(config, tableName, { action: "rename-table", to })
  })
}
