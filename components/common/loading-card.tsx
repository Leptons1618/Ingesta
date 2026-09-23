import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Busy state for an area that is already inside a card, so it deliberately
 * draws no container of its own.
 */
export function LoadingCard({ label, hint, className }: { label: string; hint?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-12 text-center", className)}>
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="font-medium">{label}</p>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
