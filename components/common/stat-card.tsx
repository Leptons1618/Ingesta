"use client"

import { useEffect, useState } from "react"
import type { ReactNode } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { useAppSettingsStore } from "@/lib/settings"
import { cn } from "@/lib/utils"

const TONES = {
  default: { value: "", icon: "text-primary" },
  positive: { value: "text-emerald-600 dark:text-emerald-400", icon: "text-emerald-600 dark:text-emerald-400" },
  warning: { value: "text-amber-600 dark:text-amber-400", icon: "text-amber-600 dark:text-amber-400" },
  danger: { value: "text-destructive", icon: "text-destructive" },
} as const

const COUNT_UP_MS = 550

/**
 * Counts a numeric value up from zero; anything else renders untouched.
 *
 * `requestAnimationFrame` does not fire in a hidden or backgrounded tab, so the
 * animation is backed by a plain timeout that always lands on the exact figure.
 * A stat card that reads 0 is worse than one that never animates.
 */
function useCountUp(value: ReactNode): ReactNode {
  const reducedMotion = useAppSettingsStore((state) => state.reducedMotion)
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (typeof value !== "number" || !Number.isFinite(value)) return
    if (reducedMotion) {
      setDisplay(value)
      return
    }

    const startedAt = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - startedAt) / COUNT_UP_MS)
      // Ease-out cubic: fast start, settles on the exact figure.
      setDisplay(Math.round(value * (1 - Math.pow(1 - progress, 3))))
      if (progress < 1) frame = requestAnimationFrame(step)
    })

    const settle = setTimeout(() => {
      cancelAnimationFrame(frame)
      setDisplay(value)
    }, COUNT_UP_MS + 100)

    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(settle)
    }
  }, [reducedMotion, value])

  return typeof value === "number" && Number.isFinite(value) ? display : value
}

/** One headline number with its label. Reused by every stage that reports counts. */
export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = "default",
  className,
}: {
  label: string
  value: ReactNode
  icon?: ReactNode
  hint?: string
  tone?: keyof typeof TONES
  className?: string
}) {
  const display = useCountUp(value)
  const { value: valueTone, icon: iconTone } = TONES[tone] ?? TONES.default

  return (
    <Card className={cn("card-shell hover-lift py-4 shadow-none", className)}>
      <CardContent className="flex items-center gap-3 px-4">
        {icon ? <span className={iconTone}>{icon}</span> : null}
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn("mt-0.5 truncate text-xl font-semibold tabular-nums", valueTone)}>{display}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>{children}</div>
}
