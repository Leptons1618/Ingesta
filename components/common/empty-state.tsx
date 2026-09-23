import type { ReactNode } from "react"

import { Card, CardContent } from "@/components/ui/card"

/** Shown when a list or table has nothing in it yet. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <Card className="card-shell">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        {icon ? (
          <span className="animate-scale-in grid size-10 place-items-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">
            {icon}
          </span>
        ) : null}
        <div className="space-y-1">
          <p className="font-semibold">{title}</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  )
}
