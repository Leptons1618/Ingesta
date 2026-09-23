"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import type { RetentionPolicy } from "@/lib/types"

export type ThemeMode = "light" | "dark" | "system"
export type ThemePreset = "default" | "dracula" | "warm" | "ocean" | "light" | "solaris"
export type TableDensity = "compact" | "comfortable" | "relaxed"

/**
 * Limits that keep the browser workspace from growing without bound. These are
 * enforced in `lib/workspace.ts` (datasets) and `lib/storage.ts` (run history).
 */
export const DEFAULT_RETENTION: RetentionPolicy = {
  maxDatasets: 25,
  maxRowsPerDataset: 50_000,
  maxRunHistory: 20,
  maxSnapshotsPerTable: 5,
  datasetTtlDays: 30,
}

export interface GuardrailSettings {
  /** Destructive operations require typing the affected object's name. */
  requireTypedConfirmation: boolean
  /** The query console may run statements that change the database. */
  allowWriteSql: boolean
  /** Take a database snapshot before a destructive table change. */
  snapshotBeforeMutation: boolean
  /** Rows pulled into the browser per page when browsing a table. */
  maxRowsPerPage: number
}

export const DEFAULT_GUARDRAILS: GuardrailSettings = {
  requireTypedConfirmation: true,
  allowWriteSql: false,
  snapshotBeforeMutation: true,
  maxRowsPerPage: 200,
}

export const themePresetOptions: Array<{ value: ThemePreset; label: string; description: string }> = [
  { value: "default", label: "Default", description: "Neutral product palette." },
  { value: "dracula", label: "Dracula", description: "Lavender and pink contrast." },
  { value: "warm", label: "Warm", description: "Terracotta and amber tones." },
  { value: "ocean", label: "Ocean", description: "Teal and blue accents." },
  { value: "light", label: "Light", description: "Soft sky palette for bright mode users." },
  { value: "solaris", label: "Solaris", description: "Citrus and emerald highlights." },
]

interface AppSettingsState {
  themeMode: ThemeMode
  themePreset: ThemePreset
  tableDensity: TableDensity
  zebraRows: boolean
  stickyHeaders: boolean
  reducedMotion: boolean
  compactCards: boolean
  retention: RetentionPolicy
  guardrails: GuardrailSettings
  setThemeMode: (value: ThemeMode) => void
  setThemePreset: (value: ThemePreset) => void
  setTableDensity: (value: TableDensity) => void
  setZebraRows: (value: boolean) => void
  setStickyHeaders: (value: boolean) => void
  setReducedMotion: (value: boolean) => void
  setCompactCards: (value: boolean) => void
  setRetention: (patch: Partial<RetentionPolicy>) => void
  setGuardrails: (patch: Partial<GuardrailSettings>) => void
  resetSettings: () => void
}

const defaultSettings = {
  themeMode: "system" as ThemeMode,
  themePreset: "default" as ThemePreset,
  tableDensity: "comfortable" as TableDensity,
  zebraRows: true,
  stickyHeaders: true,
  reducedMotion: false,
  compactCards: false,
  retention: DEFAULT_RETENTION,
  guardrails: DEFAULT_GUARDRAILS,
}

export const useAppSettingsStore = create<AppSettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      setThemeMode: (value) => set({ themeMode: value }),
      setThemePreset: (value) => set({ themePreset: value }),
      setTableDensity: (value) => set({ tableDensity: value }),
      setZebraRows: (value) => set({ zebraRows: value }),
      setStickyHeaders: (value) => set({ stickyHeaders: value }),
      setReducedMotion: (value) => set({ reducedMotion: value }),
      setCompactCards: (value) => set({ compactCards: value }),
      setRetention: (patch) => set((state) => ({ retention: { ...state.retention, ...patch } })),
      setGuardrails: (patch) => set((state) => ({ guardrails: { ...state.guardrails, ...patch } })),
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: "ingesta-ui-settings",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        themeMode: state.themeMode,
        themePreset: state.themePreset,
        tableDensity: state.tableDensity,
        zebraRows: state.zebraRows,
        stickyHeaders: state.stickyHeaders,
        reducedMotion: state.reducedMotion,
        compactCards: state.compactCards,
        retention: state.retention,
        guardrails: state.guardrails,
      }),
      // Settings written by an older build are merged over the defaults so a
      // new field never arrives undefined.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AppSettingsState>
        return {
          ...current,
          ...saved,
          retention: { ...DEFAULT_RETENTION, ...saved.retention },
          guardrails: { ...DEFAULT_GUARDRAILS, ...saved.guardrails },
        }
      },
    },
  ),
)
