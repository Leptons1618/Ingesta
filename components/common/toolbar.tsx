import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Header row of a grid panel: wraps instead of overflowing on narrow screens. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-slot="toolbar"
      className={cn("flex flex-wrap items-center gap-2 border-b border-border px-3 py-2", className)}
    >
      {children}
    </div>
  )
}

/** Keeps related controls together when the toolbar wraps. */
export function ToolbarGroup({
  children,
  label,
  className,
}: {
  children: ReactNode
  label?: string
  className?: string
}) {
  return (
    <div data-slot="toolbar-group" aria-label={label} className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  )
}

/** Pushes everything after it to the trailing edge of the row. */
export function ToolbarSpacer({ className }: { className?: string }) {
  return <div data-slot="toolbar-spacer" aria-hidden className={cn("ml-auto", className)} />
}
