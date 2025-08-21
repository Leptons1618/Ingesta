"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Database, CheckCircle, AlertCircle, Eye, EyeOff } from "lucide-react"
import { type DatabaseConfig, type ConnectionTestResult } from "@/lib/database-manager"
import { ConnectionStorage } from "@/lib/connection-storage"

interface DatabaseConnectionFormProps {
  onConnectionSaved: (config: DatabaseConfig) => void
}

export function DatabaseConnectionForm({ onConnectionSaved }: DatabaseConnectionFormProps) {
  const [config, setConfig] = useState<Partial<DatabaseConfig>>({
    type: "mysql",
    port: 3306,
    ssl: false,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const handleTypeChange = (type: DatabaseConfig["type"]) => {
    const defaultPorts = {
      mysql: 3306,
      postgresql: 5432,
      sqlite: undefined,
      mssql: 1433,
    }

    setConfig((prev) => ({
      ...prev,
      type,
      port: defaultPorts[type],
    }))
  }

  const handleTestConnection = async () => {
    if (!config.database || !config.name) {
      setTestResult({
        success: false,
        message: "Please fill in connection name and database name",
      })
      return
    }

    setIsTestingConnection(true)
    setTestResult(null)

    try {
      const response = await fetch('/api/database/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const result = await response.json()
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        message: "Failed to test connection",
      })
    } finally {
      setIsTestingConnection(false)
    }
  }

  const handleSaveConnection = async () => {
    if (!testResult?.success) {
      setTestResult({
        success: false,
        message: "Please test the connection first",
      })
      return
    }

    setIsSaving(true)

    try {
      const fullConfig: DatabaseConfig = {
        ...config,
        id: Date.now().toString(),
        name: config.name!,
        database: config.database!,
        type: config.type!,
      } as DatabaseConfig

      ConnectionStorage.saveConnection(fullConfig)
      onConnectionSaved(fullConfig)

      // Reset form
      setConfig({
        type: "mysql",
        port: 3306,
        ssl: false,
      })
      setTestResult(null)
    } catch (error) {
      setTestResult({
        success: false,
        message: "Failed to save connection",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          Database Connection
        </CardTitle>
        <CardDescription>Configure your database connection settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connection Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Connection Name</Label>
          <Input
            id="name"
            placeholder="My Database Connection"
            value={config.name || ""}
            onChange={(e) => setConfig((prev) => ({ ...prev, name: e.target.value }))}
          />
        </div>

        {/* Database Type */}
        <div className="space-y-2">
          <Label htmlFor="type">Database Type</Label>
          <Select value={config.type} onValueChange={handleTypeChange}>
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
                  onChange={(e) => setConfig((prev) => ({ ...prev, host: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={config.port || ""}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, port: Number.parseInt(e.target.value) || undefined }))
                  }
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="database">Database Name</Label>
            <Input
              id="database"
              placeholder={config.type === "sqlite" ? "database.db" : "my_database"}
              value={config.database || ""}
              onChange={(e) => setConfig((prev) => ({ ...prev, database: e.target.value }))}
            />
          </div>

          {config.type !== "sqlite" && (
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                placeholder="username"
                value={config.username || ""}
                onChange={(e) => setConfig((prev) => ({ ...prev, username: e.target.value }))}
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
                onChange={(e) => setConfig((prev) => ({ ...prev, password: e.target.value }))}
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
              onCheckedChange={(checked) => setConfig((prev) => ({ ...prev, ssl: checked }))}
            />
            <Label htmlFor="ssl">Use SSL Connection</Label>
          </div>
        )}

        {/* Test Result */}
        {testResult && (
          <Alert className={testResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
            {testResult.success ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
            <AlertDescription className={testResult.success ? "text-green-800" : "text-red-800"}>
              {testResult.message}
              {testResult.success && testResult.details && (
                <div className="mt-2 space-y-1 text-sm">
                  <div>Server Version: {testResult.details.serverVersion}</div>
                  <div>Database: {testResult.details.databaseName}</div>
                  <div>Tables Found: {testResult.details.tablesCount}</div>
                </div>
              )}
            </AlertDescription>
          </Alert>
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
              "Test Connection"
            )}
          </Button>

          <Button onClick={handleSaveConnection} disabled={!testResult?.success || isSaving} className="flex-1">
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Connection"
            )}
          </Button>
        </div>

        {/* Connection String Preview */}
        {config.type && config.database && (
          <div className="space-y-2">
            <Label>Connection String Preview</Label>
            <div className="p-3 bg-muted rounded-lg">
              <code className="text-sm text-muted-foreground break-all">
                {ConnectionStorage.generateConnectionString(config as DatabaseConfig)}
              </code>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
