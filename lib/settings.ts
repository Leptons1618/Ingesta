"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export type ThemeMode = "light" | "dark" | "system"
export type ThemePreset = "default" | "dracula" | "warm" | "ocean" | "light" | "solaris"
export type TableDensity = "compact" | "comfortable" | "relaxed"

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
  setThemeMode: (value: ThemeMode) => void
  setThemePreset: (value: ThemePreset) => void
  setTableDensity: (value: TableDensity) => void
  setZebraRows: (value: boolean) => void
  setStickyHeaders: (value: boolean) => void
  setReducedMotion: (value: boolean) => void
  setCompactCards: (value: boolean) => void
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
      }),
    },
  ),
)
