import { createSnapshot, dropSnapshot, listSnapshots, restoreSnapshot } from "@/lib/db"
import { jsonRoute } from "@/lib/http"
import type { DatabaseConfig } from "@/lib/types"

/** One route for the four snapshot operations; each answers with its own shape. */
export async function POST(request: Request) {
  const { config, action, tableName, snapshotName } = (await request.json()) as {
    config: DatabaseConfig
    action: "list" | "create" | "restore" | "drop"
    tableName?: string
    snapshotName?: string
  }

  return jsonRoute(async () => {
    if (action === "list") return { snapshots: await listSnapshots(config) }

    if (action === "create") {
      if (!tableName?.trim()) throw new Error("A snapshot needs the table it copies")
      return { snapshot: await createSnapshot(config, tableName, snapshotName) }
    }

    if (!snapshotName?.trim()) throw new Error(`A snapshot ${action} needs the snapshot name`)
    if (action === "restore") return restoreSnapshot(config, snapshotName)

    await dropSnapshot(config, snapshotName)
    return { message: `Snapshot "${snapshotName}" dropped` }
  })
}
