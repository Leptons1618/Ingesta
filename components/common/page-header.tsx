import type { ReactNode } from "react"

/** Top bar shared by the workflow and settings pages. */
export function PageHeader({
  title,
  description,
  badge,
  actions,
}: {
  title: string
  description: string
  badge?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
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
