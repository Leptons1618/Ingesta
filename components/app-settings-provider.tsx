"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"

import { useAppSettingsStore } from "@/lib/settings"

export function AppSettingsProvider() {
  const { setTheme } = useTheme()
  const themeMode = useAppSettingsStore((state) => state.themeMode)
  const themePreset = useAppSettingsStore((state) => state.themePreset)
  const tableDensity = useAppSettingsStore((state) => state.tableDensity)
  const zebraRows = useAppSettingsStore((state) => state.zebraRows)
  const stickyHeaders = useAppSettingsStore((state) => state.stickyHeaders)
  const reducedMotion = useAppSettingsStore((state) => state.reducedMotion)
  const compactCards = useAppSettingsStore((state) => state.compactCards)

  useEffect(() => {
    setTheme(themeMode)
  }, [setTheme, themeMode])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.themePreset = themePreset
    root.dataset.tableDensity = tableDensity
    root.dataset.zebraRows = zebraRows ? "true" : "false"
    root.dataset.stickyHeaders = stickyHeaders ? "true" : "false"
    root.dataset.compactCards = compactCards ? "true" : "false"
    root.classList.toggle("reduce-motion", reducedMotion)
  }, [compactCards, reducedMotion, stickyHeaders, tableDensity, themePreset, zebraRows])

  return null
}