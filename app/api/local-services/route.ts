import { readdirSync, statSync } from "node:fs"
import { connect } from "node:net"
import { join } from "node:path"

import { jsonRoute } from "@/lib/http"
import { DATABASE_TYPES, DEFAULT_PORTS, type LocalService } from "@/lib/types"

/**
 * A loopback port probe. Long enough for a handshake, short enough that the
 * connection dialog does not wait on a machine with nothing listening.
 */
const PROBE_TIMEOUT_MS = 350

const SQLITE_EXTENSIONS = [".db", ".sqlite", ".sqlite3"]
const MAX_SQLITE_FILES = 20

function probePort(port: number): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const socket = connect({ host: "127.0.0.1", port })

  const settle = (reachable: boolean) => {
    socket.destroy()
    resolve(reachable)
  }

  socket.setTimeout(PROBE_TIMEOUT_MS)
  socket.once("connect", () => settle(true))
  socket.once("timeout", () => settle(false))
  socket.once("error", () => settle(false))

  return promise
}

/** Databases the app itself has written, sitting next to it. */
function findSqliteFiles(directory: string) {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          SQLITE_EXTENSIONS.some((extension) => entry.name.toLowerCase().endsWith(extension)),
      )
      .slice(0, MAX_SQLITE_FILES)
      .map((entry) => {
        const path = join(directory, entry.name)
        return { path, name: entry.name, size: statSync(path).size }
      })
  } catch {
    // An unreadable directory simply means there is nothing to offer.
    return []
  }
}

/**
 * What is listening on this machine.
 *
 * Detection is a TCP probe on the engines' default ports plus a listing of the
 * SQLite files in the working directory. Nothing here authenticates: a reachable
 * port says a service is up, not that these credentials work, and the UI says so.
 */
export async function POST() {
  return jsonRoute(async () => {
    const engines = DATABASE_TYPES.filter((type) => DEFAULT_PORTS[type] !== undefined)

    const services: LocalService[] = await Promise.all(
      engines.map(async (type) => {
        const port = DEFAULT_PORTS[type] as number
        return { type, host: "127.0.0.1", port, reachable: await probePort(port) }
      }),
    )

    return { services, sqliteFiles: findSqliteFiles(process.cwd()) }
  })
}
