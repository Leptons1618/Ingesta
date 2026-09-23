"use client"

import { useEffect, useState } from "react"
import { Eye, EyeOff, PlugZap } from "lucide-react"

import { StatusAlert } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { ConnectionStorage } from "@/lib/storage"
import { toast } from "@/lib/toast"
import { DATABASE_LABELS, DATABASE_TYPES, DEFAULT_PORTS, type DatabaseConfig, type DatabaseType } from "@/lib/types"

interface ConnectionEditorProps {
  /** The profile being edited; `null` keeps the dialog closed and empty. */
  connection: DatabaseConfig | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

/** Editors show the stored profile, so every field starts populated. */
function draftFrom(connection: DatabaseConfig): DatabaseConfig {
  return { ...connection }
}

/**
 * Editing lives here rather than in `DatabaseConnectionForm`, which creates a
 * new profile on every save and is shared with the import wizard. This one
 * keeps the id, so anything already pointing at the profile keeps working.
 */
export function ConnectionEditor({ connection, onOpenChange, onSaved }: ConnectionEditorProps) {
  const [draft, setDraft] = useState<DatabaseConfig | null>(connection ? draftFrom(connection) : null)
  const [showPassword, setShowPassword] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    setDraft(connection ? draftFrom(connection) : null)
    setShowPassword(false)
    setMessage(null)
  }, [connection])

  const setField = (patch: Partial<DatabaseConfig>) => {
    setDraft((previous) => (previous ? { ...previous, ...patch } : previous))
    setMessage(null)
  }

  const valid = Boolean(draft?.name.trim() && draft?.database.trim())
  const needsServerDetails = draft !== null && draft.type !== "sqlite" && (!draft.host?.trim() || !draft.username?.trim())

  const handleTest = async () => {
    if (!draft) return
    if (!valid) {
      setMessage({ tone: "error", text: "A profile needs a name and a database." })
      return
    }

    setTesting(true)
    setMessage(null)
    const result = await api.testConnection(draft)
    setTesting(false)

    if (!result.ok) {
      setMessage({ tone: "error", text: result.error })
      return
    }

    const details = result.data.details
    setMessage({
      tone: result.data.success ? "success" : "error",
      text: result.data.success
        ? [
            result.data.message,
            details?.serverVersion,
            details?.databaseName,
            details?.tablesCount === undefined ? undefined : `${details.tablesCount} tables`,
          ]
            .filter(Boolean)
            .join(" · ")
        : result.data.message,
    })
  }

  const handleSave = () => {
    if (!draft) return
    if (!valid) {
      setMessage({ tone: "error", text: "A profile needs a name and a database." })
      return
    }
    if (needsServerDetails) {
      setMessage({ tone: "error", text: "Host and username are required for server connections." })
      return
    }

    ConnectionStorage.save(draft)
    onSaved()
    toast.success(`"${draft.name}" saved`, "The profile was updated in place.")
  }

  return (
    <Dialog open={connection !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit connection</DialogTitle>
          <DialogDescription>
            Changes apply to this saved profile. The database on the server is not touched until you run something.
          </DialogDescription>
        </DialogHeader>

        {draft ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Connection name</Label>
              <Input id="edit-name" value={draft.name} onChange={(event) => setField({ name: event.target.value })} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-type">Database type</Label>
                <Select
                  value={draft.type}
                  onValueChange={(value) => {
                    const type = value as DatabaseType
                    setField({ type, port: DEFAULT_PORTS[type], ssl: type === "sqlite" ? false : draft.ssl })
                  }}
                >
                  <SelectTrigger id="edit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATABASE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {DATABASE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-group">Group</Label>
                <Input
                  id="edit-group"
                  value={draft.group ?? ""}
                  placeholder="Optional label"
                  onChange={(event) => setField({ group: event.target.value || undefined })}
                />
              </div>
            </div>

            {draft.type === "sqlite" ? null : (
              <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                <div className="space-y-2">
                  <Label htmlFor="edit-host">Host</Label>
                  <Input id="edit-host" value={draft.host ?? ""} onChange={(event) => setField({ host: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-port">Port</Label>
                  <Input
                    id="edit-port"
                    inputMode="numeric"
                    value={draft.port ?? ""}
                    onChange={(event) => setField({ port: Number(event.target.value) || undefined })}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="edit-database">{draft.type === "sqlite" ? "Database file" : "Database"}</Label>
              <Input
                id="edit-database"
                value={draft.database}
                onChange={(event) => setField({ database: event.target.value })}
              />
            </div>

            {draft.type === "sqlite" ? null : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-username">Username</Label>
                  <Input
                    id="edit-username"
                    value={draft.username ?? ""}
                    onChange={(event) => setField({ username: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="edit-password"
                      type={showPassword ? "text" : "password"}
                      value={draft.password ?? ""}
                      onChange={(event) => setField({ password: event.target.value })}
                      className="pr-9"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="absolute top-0 right-0 size-9"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-6">
              {draft.type === "sqlite" ? null : (
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={Boolean(draft.ssl)} onCheckedChange={(checked) => setField({ ssl: checked })} />
                  Require SSL
                </label>
              )}
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={Boolean(draft.favorite)}
                  onCheckedChange={(checked) => setField({ favorite: checked })}
                />
                Pin to the top
              </label>
            </div>

            {message ? <StatusAlert tone={message.tone}>{message.text}</StatusAlert> : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" loading={testing} onClick={() => void handleTest()}>
            {testing ? null : <PlugZap />}
            Test connection
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save changes</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
