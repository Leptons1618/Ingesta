import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * The container every page chrome uses. A page's header and its `<main>` have to
 * agree on the width, or the title drifts away from the content under it — which
 * is exactly what happened while each page wrote its own classes. Pages pick one
 * of these and pass the same one to both.
 */
export const PAGE_CONTAINER = {
  /** Full width with the page gutter. Dashboards and workspaces use this. */
  wide: "w-full px-6",
  /** Centred and capped. Long single-column flows (the import wizard) use this. */
  narrow: "mx-auto w-full max-w-5xl px-6",
} as const

export type PageWidth = keyof typeof PAGE_CONTAINER

/** Top bar shared by every page. */
export function PageHeader({
  title,
  description,
  badge,
  actions,
  width = "wide",
}: {
  title: string
  description: string
  badge?: ReactNode
  actions?: ReactNode
  width?: PageWidth
}) {
  return (
    <header className="border-b border-border bg-background">
      <div className={cn(PAGE_CONTAINER[width], "flex flex-wrap items-center justify-between gap-3 py-4")}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {badge}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
      </div>
    </header>
  )
}
