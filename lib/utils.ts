import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Normalises anything thrown into a message worth showing a user. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error ?? "Unknown error")
}

/** Formats a byte count as a short human-readable size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}

/** Short, sortable-enough identifier for records created in the browser. */
export function newId(prefix: string): string {
  const random = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}${random}`
}

/** "just now", "12m ago", "3d ago" — enough precision for a history list. */
export function formatRelativeTime(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(elapsed)) return "unknown"
  if (elapsed < 45_000) return "just now"

  const minutes = Math.round(elapsed / 60_000)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`

  return new Date(iso).toLocaleDateString()
}

/**
 * How a stored value reads on screen. Dates are shown as the value that will be
 * written rather than a localised string, and a blank is an em dash so an empty
 * cell is distinguishable from an empty string.
 *
 * Every place that shows a raw cell — the grid, previews, sample chips — uses
 * this, so a date never renders as `Date.toString()` in one panel and
 * `YYYY-MM-DD` in another.
 */
export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

