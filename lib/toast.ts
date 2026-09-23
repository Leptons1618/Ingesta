"use client"

import { create } from "zustand"

import { newId } from "@/lib/utils"

export type ToastTone = "success" | "error" | "warning" | "info"

export interface ToastRecord {
  id: string
  title: string
  description?: string
  tone: ToastTone
  durationMs: number
}

/** Failures need to be read and copied; confirmations should get out of the way. */
export const TOAST_DURATION: Record<ToastTone, number> = {
  success: 4000,
  info: 5000,
  warning: 7000,
  error: 9000,
}

/** Beyond this the oldest toast is dropped rather than pushing the stack off-screen. */
const MAX_VISIBLE = 4

interface ToastInput {
  title: string
  description?: string
  tone?: ToastTone
  /** Zero keeps the toast until it is dismissed by hand. */
  durationMs?: number
}

interface ToastState {
  toasts: ToastRecord[]
  push: (input: ToastInput) => string
  dismiss: (id: string) => void
}

/**
 * A plain queue: it holds records and nothing else. Expiry lives in the
 * `Toaster` so the timers die with the component that renders them.
 */
export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (input) => {
    const tone = input.tone ?? "info"
    const record: ToastRecord = {
      id: newId("toast"),
      title: input.title,
      description: input.description,
      tone,
      durationMs: input.durationMs ?? TOAST_DURATION[tone],
    }
    set({ toasts: [...get().toasts, record].slice(-MAX_VISIBLE) })
    return record.id
  },
  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }))
  },
}))

/** Fire-and-forget entry point so callers never import the store just to notify. */
export const toast = {
  success: (title: string, description?: string) => useToastStore.getState().push({ title, description, tone: "success" }),
  error: (title: string, description?: string) => useToastStore.getState().push({ title, description, tone: "error" }),
  warning: (title: string, description?: string) => useToastStore.getState().push({ title, description, tone: "warning" }),
  info: (title: string, description?: string) => useToastStore.getState().push({ title, description, tone: "info" }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
}
