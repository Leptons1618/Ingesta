"use client"

import { useState } from "react"
import { Database, Eye, EyeOff, Loader2 } from "lucide-react"

import { StatusAlert } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { postJson } from "@/lib/api"
import { ConnectionStorage } from "@/lib/storage"
import { DEFAULT_PORTS, type ConnectionTestResult, type DatabaseConfig, type DatabaseType, type ServerOptions } from "@/lib/types"

interface DatabaseConnectionFormProps {
  onSaved: (connections: DatabaseConfig[]) => void
}

/** The draft keeps `type` always set so server options never need a fallback. */
type ConnectionDraft = Omit<Partial<DatabaseConfig>, "type"> & { type: DatabaseType }

type DatabaseMessage = { tone: "success" | "error"; text: string }

const emptyDraft: ConnectionDraft = { type: "mysql", port: DEFAULT_PORTS.mysql, ssl: false }

export function DatabaseConnectionForm({ onSaved }: DatabaseConnectionFormProps) {
  const [config, setConfig] = useState<ConnectionDraft>(emptyDraft)
  const [showPassword, setShowPassword] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [databaseOptions, setDatabaseOptions] = useState<string[]>([])
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false)
  const [isCreatingDatabase, setIsCreatingDatabase] = useState(false)
  const [newDatabaseName, setNewDatabaseName] = useState("")
  const [databaseMessage, setDatabaseMessage] = useState<DatabaseMessage | null>(null)

  /** Any edit invalidates the last test and the last database message. */
  const setField = (patch: Partial<DatabaseConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }))
    setTestResult(null)
    setDatabaseMessage(null)
  }

  const handleTypeChange = (type: DatabaseType) => {
    setDatabaseOptions([])
    setNewDatabaseName("")
    setTestResult(null)
    setDatabaseMessage(null)
    setConfig((prev) => ({
      ...prev,
      type,
      port: DEFAULT_PORTS[type],
      database: "",
      ssl: type === "sqlite" ? false : prev.ssl,
    }))
  }

  const handleTestConnection = async () => {
    if (!config.name || !config.database) {
      setTestResult({ success: false, message: "Fill in a connection name and database name" })
      return
    }

    if (config.type !== "sqlite" && (!config.host || !config.username)) {
      setTestResult({ success: false, message: "Provide a host and username for server connections" })
      return
    }

    setIsTestingConnection(true)
    setTestResult(null)
    setDatabaseMessage(null)

    const response = await postJson<{ message: string; details?: ConnectionTestResult["details"] }>(
      "/api/test-connection",
      config,
    )

    setTestResult(
      response.ok
        ? { success: true, message: response.data.message, details: response.data.details }
        : { success: false, message: response.error },
    )
    setIsTestingConnection(false)
  }

  const handleSaveConnection = () => {
    if (!testResult?.success) {
      setTestResult({ success: false, message: "Test the connection before saving" })
      return
    }

    const saved: DatabaseConfig = {
      ...config,
      id: Date.now().toString(),
      name: config.name ?? "",
      database: config.database ?? "",
    }

    ConnectionStorage.save(saved)
    onSaved(ConnectionStorage.getAll())

    setConfig(emptyDraft)
    setTestResult(null)
    setDatabaseOptions([])
    setDatabaseMessage(null)
    setNewDatabaseName("")
  }

  const buildServerOptions = (): ServerOptions | null => {
    if (config.type !== "sqlite" && (!config.host || !config.username)) {
      setDatabaseMessage({ tone: "error", text: "Host and username are required for server connections" })
      return null
    }

    return {
      type: config.type,
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      ssl: config.ssl,
      database: config.database?.trim() || undefined,
    }
  }

  const handleLoadDatabases = async () => {
    if (config.type === "sqlite") {
      setDatabaseMessage({ tone: "error", text: "SQLite uses file paths; specify a file name above." })
      return
    }

    const serverOptions = buildServerOptions()
    if (!serverOptions) {
      return
    }

    setIsLoadingDatabases(true)
    setDatabaseMessage(null)

    try {
      const response = await postJson<{ databases: string[] }>("/api/list-databases", { config: serverOptions })

      if (!response.ok) {
        setDatabaseOptions([])
        setDatabaseMessage({ tone: "error", text: response.error })
        return
      }

      const databases = [...response.data.databases].sort((a, b) => a.localeCompare(b))
      setDatabaseOptions(databases)
      setDatabaseMessage({
        tone: "success",
        text: databases.length
          ? `Found ${databases.length} database${databases.length === 1 ? "" : "s"}.`
          : "No databases found with the provided credentials.",
      })

      if (databases.length > 0) {
        setConfig((prev) => ({ ...prev, database: prev.database || databases[0] }))
      }

      setTestResult(null)
    } finally {
      setIsLoadingDatabases(false)
    }
  }

  const handleCreateDatabase = async () => {
    if (config.type === "sqlite") {
      setDatabaseMessage({ tone: "error", text: "SQLite databases are created as files; provide a file name above." })
      return
    }

    const trimmedName = newDatabaseName.trim()
    if (!trimmedName) {
      setDatabaseMessage({ tone: "error", text: "Enter a database name" })
      return
    }

    if (!/^[A-Za-z0-9_]+$/.test(trimmedName)) {
      setDatabaseMessage({ tone: "error", text: "Database names may only include letters, numbers, and underscores" })
      return
    }

    const serverOptions = buildServerOptions()
    if (!serverOptions) {
      return
    }

    setIsCreatingDatabase(true)
    setDatabaseMessage(null)

    try {
      const response = await postJson<{ message: string }>("/api/create-database", {
        config: serverOptions,
        databaseName: trimmedName,
      })

      if (!response.ok) {
        setDatabaseMessage({ tone: "error", text: response.error })
        return
      }

      setDatabaseMessage({ tone: "success", text: `Database "${trimmedName}" created.` })
      setDatabaseOptions((prev) => Array.from(new Set([...prev, trimmedName])).sort())
      setConfig((prev) => ({ ...prev, database: trimmedName }))
      setNewDatabaseName("")
      setTestResult(null)
    } finally {
      setIsCreatingDatabase(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          Database connection
        </CardTitle>
        <CardDescription>Choose where your tables will be created.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connection Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Connection name</Label>
          <Input
            id="name"
            placeholder="Production Postgres"
            value={config.name || ""}
            onChange={(e) => setField({ name: e.target.value })}
          />
        </div>

        {/* Database Type */}
        <div className="space-y-2">
          <Label htmlFor="type">Database type</Label>
          <Select value={config.type} onValueChange={(value) => handleTypeChange(value as DatabaseType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mysql">MySQL</SelectItem>
              <SelectItem value="postgresql">PostgreSQL</SelectItem>
              <SelectItem value="sqlite">SQLite</SelectItem>
              <SelectItem value="mssql">SQL Server</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Connection Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {config.type !== "sqlite" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="host">Host</Label>
                <Input
                  id="host"
                  placeholder="localhost"
                  value={config.host || ""}
                  onChange={(e) => setField({ host: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={config.port || ""}
                  onChange={(e) => setField({ port: Number.parseInt(e.target.value) || undefined })}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="database">Database</Label>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col md:flex-row md:items-center md:gap-2">
                <Input
                  id="database"
                  placeholder={config.type === "sqlite" ? "database.db" : "my_database"}
                  value={config.database || ""}
                  onChange={(e) => setField({ database: e.target.value })}
                />
                {config.type !== "sqlite" && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleLoadDatabases}
                    disabled={isLoadingDatabases}
                    className="mt-2 md:mt-0 md:w-auto"
                  >
                    {isLoadingDatabases ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      "Browse"
                    )}
                  </Button>
                )}
              </div>

              {config.type !== "sqlite" && databaseOptions.length > 0 && (
                <Select
                  value={
                    config.database && databaseOptions.includes(config.database)
                      ? config.database
                      : undefined
                  }
                  onValueChange={(value) => setField({ database: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an existing database" />
                  </SelectTrigger>
                  <SelectContent>
                    {databaseOptions.map((db) => (
                      <SelectItem key={db} value={db}>
                        {db}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {config.type !== "sqlite" && (
                <div className="space-y-2 rounded-md border border-dashed p-3">
                  <Label htmlFor="new-database" className="text-sm">
                    Create new database
                  </Label>
                  <div className="flex flex-col md:flex-row md:items-center md:gap-2">
                    <Input
                      id="new-database"
                      placeholder="new_database"
                      value={newDatabaseName}
                      onChange={(e) => setNewDatabaseName(e.target.value)}
                    />
                    <Button
                      type="button"
                      onClick={handleCreateDatabase}
                      disabled={isCreatingDatabase}
                      className="mt-2 md:mt-0 md:w-auto"
                    >
                      {isCreatingDatabase ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        "Create"
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {config.type !== "sqlite" && databaseMessage && (
                <StatusAlert tone={databaseMessage.tone}>{databaseMessage.text}</StatusAlert>
              )}
            </div>
          </div>

          {config.type !== "sqlite" && (
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                placeholder="username"
                value={config.username || ""}
                onChange={(e) => setField({ username: e.target.value })}
              />
            </div>
          )}
        </div>

        {config.type !== "sqlite" && (
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="password"
                value={config.password || ""}
                onChange={(e) => setField({ password: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        {config.type !== "sqlite" && (
          <div className="flex items-center space-x-2">
            <Switch
              id="ssl"
              checked={config.ssl || false}
              onCheckedChange={(checked) => setField({ ssl: checked })}
            />
            <Label htmlFor="ssl">Use SSL connection</Label>
          </div>
        )}

        {/* Test Result */}
        {testResult && (
          <StatusAlert tone={testResult.success ? "success" : "error"}>
            {testResult.message}
            {testResult.success && testResult.details ? (
              <div className="mt-2 space-y-1 text-sm">
                <div>Server version: {testResult.details.serverVersion}</div>
                <div>Database: {testResult.details.databaseName}</div>
                <div>Tables found: {testResult.details.tablesCount}</div>
              </div>
            ) : null}
          </StatusAlert>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={isTestingConnection || !config.database || !config.name}
            className="flex-1 bg-transparent"
          >
            {isTestingConnection ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              "Test connection"
            )}
          </Button>

          <Button onClick={handleSaveConnection} disabled={!testResult?.success} className="flex-1">
            Save connection
          </Button>
        </div>

        {/* Connection String Preview */}
        {config.database && (
          <div className="space-y-2">
            <Label>Connection string preview</Label>
            <div className="p-3 bg-muted rounded-lg">
              <code className="text-sm text-muted-foreground break-all">
                {ConnectionStorage.connectionString(config as DatabaseConfig)}
              </code>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
