import { ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react"

import { RISK_LABEL } from "@/lib/guardrails"
import type { RiskLevel } from "@/lib/types"
import { cn } from "@/lib/utils"

const RISK_STYLES: Record<RiskLevel, { frame: string; icon: typeof ShieldCheck }> = {
  safe: {
    frame: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    icon: ShieldCheck,
  },
  caution: {
    frame: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    icon: TriangleAlert,
  },
  destructive: {
    frame: "border-destructive/40 bg-destructive/10 text-destructive",
    icon: ShieldAlert,
  },
}

/** Colour-coded pill for a guardrail verdict; the only place risk reads visually. */
export function RiskBadge({ risk, className }: { risk: RiskLevel; className?: string }) {
  const { frame, icon: Icon } = RISK_STYLES[risk]

  return (
    <span
      data-slot="risk-badge"
      data-risk={risk}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        frame,
        className
      )}
    >
      <Icon className="size-3.5" />
      {RISK_LABEL[risk]}
    </span>
  )
}
