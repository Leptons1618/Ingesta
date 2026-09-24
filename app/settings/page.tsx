"use client"

import { useCallback, useEffect, useState } from "react"
import { errorMessage } from "@/lib/utils"
import Link from "next/link"
import {
  Database,
  HardDrive,
  Loader2,
  Monitor,
  MoonStar,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  SunMedium,
  TableProperties,
  Trash2,
} from "lucide-react"

import { PageHeader, StatCard, StatGrid, StatusAlert } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { themePresetOptions, useAppSettingsStore, type TableDensity, type ThemeMode, type ThemePreset } from "@/lib/settings"
import { RunHistory } from "@/lib/storage"
import type { RetentionPolicy } from "@/lib/types"
import { formatBytes } from "@/lib/utils"
import { Workspace } from "@/lib/workspace"

const themeModeOptions: Array<{ value: ThemeMode; label: string; icon: typeof SunMedium }> = [
  { value: "light", label: "Light", icon: SunMedium },
  { value: "dark", label: "Dark", icon: MoonStar },
  { value: "system", label: "System", icon: Monitor },
]

/** The numeric limits, in the order they appear, with the copy that explains them. */
const retentionFields: Array<{ key: keyof RetentionPolicy; title: string; description: string; min: number; max: number; step: number; unit: string }> = [
  {
    key: "maxDatasets",
    title: "Datasets kept",
    description: "Oldest datasets are pruned once this many are stored.",
    min: 1,
    max: 500,
    step: 1,
    unit: "datasets",
  },
  {
    key: "maxRowsPerDataset",
    title: "Rows per dataset",
    description: "An import larger than this is truncated before it reaches the browser workspace.",
    min: 100,
    max: 1_000_000,
    step: 1000,
    unit: "rows",
  },
  {
    key: "maxRunHistory",
    title: "Run history",
    description: "Completed import runs kept for the dashboard and the run report.",
    min: 1,
    max: 200,
    step: 1,
    unit: "runs",
  },
  {
    key: "maxSnapshotsPerTable",
    title: "Snapshots per table",
    description: "Database-side copies kept for one table before the oldest is dropped.",
    min: 1,
    max: 50,
    step: 1,
    unit: "snapshots",
  },
  {
    key: "datasetTtlDays",
    title: "Dataset lifetime",
    description: "Datasets untouched for this long are pruned. Set to 0 to keep them forever.",
    min: 0,
    max: 365,
    step: 1,
    unit: "days",
  },
]

export default function SettingsPage() {
  const themeMode = useAppSettingsStore((state) => state.themeMode)
  const themePreset = useAppSettingsStore((state) => state.themePreset)
  const tableDensity = useAppSettingsStore((state) => state.tableDensity)
  const zebraRows = useAppSettingsStore((state) => state.zebraRows)
  const stickyHeaders = useAppSettingsStore((state) => state.stickyHeaders)
  const reducedMotion = useAppSettingsStore((state) => state.reducedMotion)
  const compactCards = useAppSettingsStore((state) => state.compactCards)
  const retention = useAppSettingsStore((state) => state.retention)
  const guardrails = useAppSettingsStore((state) => state.guardrails)
  const setThemeMode = useAppSettingsStore((state) => state.setThemeMode)
  const setThemePreset = useAppSettingsStore((state) => state.setThemePreset)
  const setTableDensity = useAppSettingsStore((state) => state.setTableDensity)
  const setZebraRows = useAppSettingsStore((state) => state.setZebraRows)
  const setStickyHeaders = useAppSettingsStore((state) => state.setStickyHeaders)
  const setReducedMotion = useAppSettingsStore((state) => state.setReducedMotion)
  const setCompactCards = useAppSettingsStore((state) => state.setCompactCards)
  const setRetention = useAppSettingsStore((state) => state.setRetention)
  const setGuardrails = useAppSettingsStore((state) => state.setGuardrails)
  const resetSettings = useAppSettingsStore((state) => state.resetSettings)

  const [usage, setUsage] = useState<{ datasets: number; rows: number; bytes: number } | null>(null)
  const [runs, setRuns] = useState(0)
  const [message, setMessage] = useState<{ tone: "success" | "warning" | "error"; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const refreshUsage = useCallback(async () => {
    setUsage(await Workspace.usage())
    setRuns(RunHistory.getAll().length)
  }, [])

  useEffect(() => {
    void refreshUsage().catch((caught) => {
      setMessage({ tone: "error", text: `Could not read workspace storage: ${errorMessage(caught)}` })
    })
  }, [refreshUsage])

  const runStorageAction = useCallback(async (action: () => Promise<void>, success: () => void) => {
    setBusy(true)
    setMessage(null)
    try {
      await action()
      await refreshUsage()
      success()
    } catch (caught) {
      setMessage({ tone: "error", text: `The storage action failed: ${errorMessage(caught)}` })
    } finally {
      setBusy(false)
    }
  }, [refreshUsage])

  const prune = useCallback(() => {
    return runStorageAction(async () => {
      const { removed, remaining } = await Workspace.prune(retention)
      const trimmedRuns = RunHistory.trim(retention.maxRunHistory)
      setMessage({
        tone: removed.length > 0 || trimmedRuns > 0 ? "warning" : "success",
        text:
          removed.length === 0 && trimmedRuns === 0
            ? `Nothing to prune. ${remaining} datasets and ${runs} runs are within the limits.`
            : `Removed ${removed.length} dataset${removed.length === 1 ? "" : "s"} and ${trimmedRuns} run${trimmedRuns === 1 ? "" : "s"}.`,
      })
    }, () => undefined)
  }, [retention, runs, runStorageAction])

  const clearDatasets = useCallback(() => {
    return runStorageAction(
      () => Workspace.clear(),
      () => setMessage({ tone: "warning", text: "Every stored dataset was deleted from this browser." }),
    )
  }, [runStorageAction])

  const clearHistory = useCallback(() => {
    return runStorageAction(
      async () => RunHistory.clear(),
      () => setMessage({ tone: "warning", text: "Run history was cleared." }),
    )
  }, [runStorageAction])

  return (
    <div className="text-foreground">
      <PageHeader
        title="Settings"
        description="Personalize the look, feel, and data workspace behaviour."
        actions={
          <>
            <Button variant="outline" onClick={resetSettings}>
              Reset defaults
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">Dashboard</Link>
            </Button>
          </>
        }
      />

      <main className="grid w-full gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card className="card-shell">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                Theme and color preset
              </CardTitle>
              <CardDescription>Choose your mode and a preset palette. Changes apply immediately.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Appearance</p>
                  <Select value={themeMode} onValueChange={(value) => setThemeMode(value as ThemeMode)}>
                    <SelectTrigger className="w-full" aria-label="Appearance">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {themeModeOptions.map((option) => {
                        const Icon = option.icon
                        return (
                          <SelectItem key={option.value} value={option.value}>
                            <Icon className="size-4 text-primary" />
                            {option.label}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {themeMode === "system"
                      ? "Follows the operating system preference."
                      : `Always ${themeMode}, whatever the system does.`}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Preset palette</p>
                  <Select value={themePreset} onValueChange={(value) => setThemePreset(value as ThemePreset)}>
                    <SelectTrigger className="w-full" aria-label="Preset palette">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {themePresetOptions.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {themePresetOptions.find((preset) => preset.value === themePreset)?.description}
                  </p>
                </div>
              </div>

              {/* The swatches read the live tokens, so they are the selected
                  palette's colours rather than a fixed illustration. */}
              <div className="flex items-center gap-2 rounded-lg border p-3">
                <span className="h-3 w-3 rounded-full bg-primary" />
                <span className="h-3 w-3 rounded-full bg-secondary" />
                <span className="h-3 w-3 rounded-full bg-accent" />
                <span className="ml-1 text-xs text-muted-foreground">
                  Accent colours of the selected palette.
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="card-shell">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TableProperties className="h-5 w-5 text-primary" />
                Table preferences
              </CardTitle>
              <CardDescription>Keep previews easy to scan without adding extra UI weight.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <p className="text-sm font-medium">Density</p>
                <Select value={tableDensity} onValueChange={(value) => setTableDensity(value as TableDensity)}>
                  <SelectTrigger className="w-full" aria-label="Density">
                    <SelectValue placeholder="Select density" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="comfortable">Comfortable</SelectItem>
                    <SelectItem value="relaxed">Relaxed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <SettingsSwitch
                  title="Sticky headers"
                  description="Keep column names visible while scrolling large previews."
                  checked={stickyHeaders}
                  onCheckedChange={setStickyHeaders}
                />
                <SettingsSwitch
                  title="Zebra rows"
                  description="Add alternating row backgrounds for faster scanning."
                  checked={zebraRows}
                  onCheckedChange={setZebraRows}
                />
                <SettingsSwitch
                  title="Compact cards"
                  description="Reduce card padding for denser workspaces on smaller screens."
                  checked={compactCards}
                  onCheckedChange={setCompactCards}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="card-shell">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Guardrails
              </CardTitle>
              <CardDescription>
                How much the app holds you back before something irreversible happens. Nothing here is applied
                silently — every destructive action is classified in <code className="text-xs">lib/guardrails.ts</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SettingsSwitch
                title="Type to confirm destructive actions"
                description="Dropping a table, truncating it, or replacing its rows requires typing the object's name. Turning this off leaves the warning in place but removes the typed step."
                checked={guardrails.requireTypedConfirmation}
                onCheckedChange={(value) => setGuardrails({ requireTypedConfirmation: value })}
              />
              <SettingsSwitch
                title="Snapshot before a destructive change"
                description="A copy of the table is stored in the database before it is altered, so the change can be rolled back."
                checked={guardrails.snapshotBeforeMutation}
                onCheckedChange={(value) => setGuardrails({ snapshotBeforeMutation: value })}
              />
              <SettingsSwitch
                title="Allow write statements in the query console"
                description="Off by default. While off, only SELECT, WITH, EXPLAIN and read-only pragmas run; anything that changes the database is refused before it reaches the server."
                checked={guardrails.allowWriteSql}
                onCheckedChange={(value) => setGuardrails({ allowWriteSql: value })}
              />
              <SettingsNumber
                title="Rows per page when browsing a table"
                description="How much of a table is pulled into the browser at once. Larger pages mean fewer round trips and more memory."
                value={guardrails.maxRowsPerPage}
                min={10}
                max={5000}
                step={10}
                unit="rows"
                onChange={(value) => setGuardrails({ maxRowsPerPage: value })}
              />
            </CardContent>
          </Card>

          <Card className="card-shell">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-primary" />
                Data retention
              </CardTitle>
              <CardDescription>
                What the browser workspace is allowed to keep. Datasets live in IndexedDB; connections and run
                history live in localStorage.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                {retentionFields.map((field) => (
                  <SettingsNumber
                    key={field.key}
                    title={field.title}
                    description={field.description}
                    value={retention[field.key]}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    unit={field.unit}
                    onChange={(value) => setRetention({ [field.key]: value } as Partial<RetentionPolicy>)}
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button variant="outline" onClick={prune} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Prune now
                </Button>
                <Button variant="outline" onClick={clearDatasets} disabled={busy}>
                  Delete all datasets
                </Button>
                <Button variant="outline" onClick={clearHistory} disabled={busy}>
                  Clear run history
                </Button>
              </div>

              {message ? (
                <StatusAlert tone={message.tone}>{message.text}</StatusAlert>
              ) : null}
            </CardContent>
          </Card>

          <Card className="card-shell">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-primary" />
                Performance and motion
              </CardTitle>
              <CardDescription>Prefer a calmer, lighter interface when you want the UI to stay extra responsive.</CardDescription>
            </CardHeader>
            <CardContent>
              <SettingsSwitch
                title="Reduce motion"
                description="Cuts transition and animation time across the UI."
                checked={reducedMotion}
                onCheckedChange={setReducedMotion}
              />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="card-shell">
            <CardHeader>
              <CardTitle>Workspace storage</CardTitle>
              <CardDescription>What this browser is currently holding.</CardDescription>
            </CardHeader>
            <CardContent>
              <StatGrid className="grid-cols-2 lg:grid-cols-2">
                <StatCard label="Datasets" value={usage ? usage.datasets.toLocaleString() : "—"} />
                <StatCard label="Rows" value={usage ? usage.rows.toLocaleString() : "—"} />
                <StatCard label="Size" value={usage ? formatBytes(usage.bytes) : "—"} />
                <StatCard label="Runs" value={runs.toLocaleString()} />
              </StatGrid>
              <p className="mt-3 text-xs text-muted-foreground">
                Size is an estimate of the grid held in memory, not the IndexedDB footprint on disk.
              </p>
            </CardContent>
          </Card>

          <Card className="card-shell">
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>A quick read on the current personalization settings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <PreviewRow label="Mode" value={themeMode} />
              <PreviewRow label="Preset" value={themePreset} />
              <PreviewRow label="Density" value={tableDensity} />
              <PreviewRow label="Sticky headers" value={stickyHeaders ? "On" : "Off"} />
              <PreviewRow label="Zebra rows" value={zebraRows ? "On" : "Off"} />
              <PreviewRow label="Reduced motion" value={reducedMotion ? "On" : "Off"} />
              <PreviewRow label="Typed confirmation" value={guardrails.requireTypedConfirmation ? "On" : "Off"} />
              <PreviewRow label="Write SQL" value={guardrails.allowWriteSql ? "On" : "Off"} />
              <PreviewRow label="Auto snapshot" value={guardrails.snapshotBeforeMutation ? "On" : "Off"} />
            </CardContent>
          </Card>

          <Card className="card-shell">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                Where things live
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Connections and run history are stored in this browser&apos;s localStorage, passwords included. They never leave the device except in the request that opens the connection.</p>
              <p>Datasets are stored in IndexedDB. Snapshots are stored inside the target database as real tables named <code className="text-xs">_ingesta_snap_*</code>.</p>
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  )
}

function SettingsSwitch({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string
  description: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) {
  const inputId = `setting-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
      <div className="min-w-0">
        <label htmlFor={inputId} className="font-medium">{title}</label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch id={inputId} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function SettingsNumber({
  title,
  description,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  title: string
  description: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (value: number) => void
}) {
  const inputId = `setting-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border p-4">
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="font-medium">{title}</label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          className="w-28"
          onChange={(event) => {
            const parsed = Number(event.target.value)
            if (!Number.isFinite(parsed)) return
            onChange(Math.min(max, Math.max(min, Math.trunc(parsed))))
          }}
        />
        <span className="w-16 shrink-0 text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  )
}
function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  )
}
