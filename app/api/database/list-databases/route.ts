import { NextRequest, NextResponse } from "next/server"
import { DatabaseManager, type DatabaseServerOptions } from "@/lib/database-manager"

export async function POST(request: NextRequest) {
  try {
    const { config } = (await request.json()) as { config?: DatabaseServerOptions }

    if (!config || !config.type) {
      return NextResponse.json(
        { success: false, message: "Database type is required" },
        { status: 400 }
      )
    }

    const databases = await DatabaseManager.listDatabases(config)

    return NextResponse.json({ success: true, databases })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list databases"
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}
