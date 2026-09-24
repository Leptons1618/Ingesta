import { createSnapshot, dropSnapshot, listSnapshots, restoreSnapshot } from "@/lib/db"
import { assertOneOf, jsonRoute, readJson } from "@/lib/http"
import type { DatabaseConfig } from "@/lib/types"

const SNAPSHOT_ACTIONS = ["list", "create", "restore", "drop"] as const

/** One route for the four snapshot operations; each answers with its own shape. */
export async function POST(request: Request) {
  return jsonRoute(async () => {
    const { config, action, tableName, snapshotName, maxSnapshots } = await readJson<{
      config: DatabaseConfig
      action: (typeof SNAPSHOT_ACTIONS)[number]
      tableName?: string
      snapshotName?: string
      maxSnapshots?: number
    }>(request)
    const validAction = assertOneOf(action, SNAPSHOT_ACTIONS, "snapshot action")

    if (validAction === "list") return { snapshots: await listSnapshots(config) }

    if (validAction === "create") {
      if (!tableName?.trim()) throw new Error("A snapshot needs the table it copies")
      return { snapshot: await createSnapshot(config, tableName, snapshotName, maxSnapshots) }
    }

    if (!snapshotName?.trim()) throw new Error(`A snapshot ${validAction} needs the snapshot name`)
    if (validAction === "restore") return restoreSnapshot(config, snapshotName)

    await dropSnapshot(config, snapshotName)
    return { message: `Snapshot "${snapshotName}" dropped` }
  })
}
