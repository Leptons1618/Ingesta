import type { ReactNode } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/** One headline number with its label. Reused by every stage that reports counts. */
export function StatCard({
  label,
  value,
  icon,
  hint,
  className,
}: {
  label: string
  value: ReactNode
  icon?: ReactNode
  hint?: string
  className?: string
}) {
  return (
    <Card className={cn("card-shell py-4 shadow-none", className)}>
      <CardContent className="flex items-center gap-3 px-4">
        {icon ? <span className="text-primary">{icon}</span> : null}
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-0.5 truncate text-xl font-semibold">{value}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>{children}</div>
}
