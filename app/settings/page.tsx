"use client"

import Link from "next/link"
import { ArrowLeft, Monitor, MoonStar, Palette, SlidersHorizontal, SunMedium, TableProperties } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { themePresetOptions, useAppSettingsStore, type TableDensity, type ThemeMode } from "@/lib/app-settings-store"

const themeModeOptions: Array<{ value: ThemeMode; label: string; icon: typeof SunMedium }> = [
  { value: "light", label: "Light", icon: SunMedium },
  { value: "dark", label: "Dark", icon: MoonStar },
  { value: "system", label: "System", icon: Monitor },
]

export default function SettingsPage() {
  const themeMode = useAppSettingsStore((state) => state.themeMode)
  const themePreset = useAppSettingsStore((state) => state.themePreset)
  const tableDensity = useAppSettingsStore((state) => state.tableDensity)
  const zebraRows = useAppSettingsStore((state) => state.zebraRows)
  const stickyHeaders = useAppSettingsStore((state) => state.stickyHeaders)
  const reducedMotion = useAppSettingsStore((state) => state.reducedMotion)
  const compactCards = useAppSettingsStore((state) => state.compactCards)
  const setThemeMode = useAppSettingsStore((state) => state.setThemeMode)
  const setThemePreset = useAppSettingsStore((state) => state.setThemePreset)
  const setTableDensity = useAppSettingsStore((state) => state.setTableDensity)
  const setZebraRows = useAppSettingsStore((state) => state.setZebraRows)
  const setStickyHeaders = useAppSettingsStore((state) => state.setStickyHeaders)
  const setReducedMotion = useAppSettingsStore((state) => state.setReducedMotion)
  const setCompactCards = useAppSettingsStore((state) => state.setCompactCards)
  const resetSettings = useAppSettingsStore((state) => state.resetSettings)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">Personalize the look, feel, and data workspace behavior.</p>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" asChild>
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <Button variant="outline" onClick={resetSettings}>Reset defaults</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card className="card-shell">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                Theme and color preset
              </CardTitle>
              <CardDescription>Choose your mode and a preset palette. Changes apply immediately.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-3">
                {themeModeOptions.map((option) => {
                  const Icon = option.icon
                  const isActive = themeMode === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setThemeMode(option.value)}
                      className={`cursor-pointer rounded-xl border px-4 py-4 text-left transition-colors ${isActive ? "border-primary bg-primary/8" : "hover:bg-muted/40"}`}
                    >
                      <Icon className="h-4 w-4 text-primary" />
                      <p className="mt-3 font-medium">{option.label}</p>
                      <p className="text-sm text-muted-foreground">{option.value === "system" ? "Follow OS preference" : `Force ${option.label.toLowerCase()} mode`}</p>
                    </button>
                  )
                })}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">Preset palette</p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {themePresetOptions.map((preset) => {
                    const isActive = themePreset === preset.value
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setThemePreset(preset.value)}
                        className={`cursor-pointer rounded-xl border px-4 py-4 text-left transition-colors ${isActive ? "border-primary bg-primary/8" : "hover:bg-muted/40"}`}
                      >
                        <div className="mb-3 flex gap-2">
                          <span className="h-3 w-3 rounded-full bg-primary" />
                          <span className="h-3 w-3 rounded-full bg-secondary" />
                          <span className="h-3 w-3 rounded-full bg-accent" />
                        </div>
                        <p className="font-medium">{preset.label}</p>
                        <p className="text-sm text-muted-foreground">{preset.description}</p>
                      </button>
                    )
                  })}
                </div>
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
                  <SelectTrigger className="w-full">
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
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border p-4">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  )
}