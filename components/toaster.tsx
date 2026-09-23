"use client"

import { useCallback, useEffect, useState } from "react"
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react"

import { Toast, ToastClose, ToastDescription, ToastTitle } from "@/components/ui/toast"
import { useToastStore, type ToastRecord, type ToastTone } from "@/lib/toast"
import { cn } from "@/lib/utils"

const ICONS: Record<ToastTone, typeof Info> = {
  success: CircleCheck,
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
}

const ICON_TONES: Record<ToastTone, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  error: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-primary",
}

/** Long enough for the exit animation to read, short enough to feel responsive. */
const EXIT_MS = 160

function ToastItem({ record, onDismiss }: { record: ToastRecord; onDismiss: (id: string) => void }) {
  const [leaving, setLeaving] = useState(false)
  const Icon = ICONS[record.tone]

  const close = useCallback(() => setLeaving(true), [])

  useEffect(() => {
    if (record.durationMs <= 0) return
    const timer = setTimeout(() => setLeaving(true), record.durationMs)
    return () => clearTimeout(timer)
  }, [record.durationMs])

  // The record is only dropped once the exit animation has had its turn, so the
  // card never disappears mid-transition. `.reduce-motion` collapses that wait.
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => onDismiss(record.id), EXIT_MS)
    return () => clearTimeout(timer)
  }, [leaving, onDismiss, record.id])

  return (
    <Toast
      tone={record.tone}
      data-state={leaving ? "closed" : "open"}
      className={cn(
        "pointer-events-auto",
        leaving
          ? "animate-out fade-out-0 slide-out-to-right-4 duration-150 fill-mode-forwards"
          : "animate-slide-in-right"
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", ICON_TONES[record.tone])} />
      <div className="min-w-0 flex-1 space-y-1">
        <ToastTitle>{record.title}</ToastTitle>
        {record.description ? <ToastDescription>{record.description}</ToastDescription> : null}
      </div>
      <ToastClose onClick={close} />
    </Toast>
  )
}

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  return (
    <div
      data-slot="toaster"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:w-96"
    >
      {toasts.map((record) => (
        <ToastItem key={record.id} record={record} onDismiss={dismiss} />
      ))}
    </div>
  )
}
