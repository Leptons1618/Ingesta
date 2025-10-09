import { NextRequest, NextResponse } from "next/server"
import { DatabaseManager, type DatabaseServerOptions } from "@/lib/database-manager"

export async function POST(request: NextRequest) {
  try {
    const { config, databaseName } = (await request.json()) as {
      config?: DatabaseServerOptions
      databaseName?: string
    }

    if (!config || !config.type) {
      return NextResponse.json(
        { success: false, message: "Database type is required" },
        { status: 400 }
      )
    }

    if (!databaseName || databaseName.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: "Database name is required" },
        { status: 400 }
      )
    }

    await DatabaseManager.createDatabase(config, databaseName.trim())

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create database"
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}
