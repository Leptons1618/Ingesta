import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react"
import type { ReactNode } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

const TONES = {
  success: {
    icon: CheckCircle2,
    frame: "border-emerald-500/30 bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  error: { icon: AlertCircle, frame: "border-destructive/30 bg-destructive/10", text: "text-destructive" },
  warning: {
    icon: TriangleAlert,
    frame: "border-amber-500/30 bg-amber-500/10",
    text: "text-amber-700 dark:text-amber-300",
  },
  info: { icon: Info, frame: "", text: "" },
} as const

/** The single place that decides how success, failure, warning and info read. */
export function StatusAlert({
  tone,
  children,
  className,
}: {
  tone: keyof typeof TONES
  children: ReactNode
  className?: string
}) {
  const { icon: Icon, frame, text } = TONES[tone]

  return (
    <Alert className={cn(frame, className)}>
      <Icon className={cn("h-4 w-4", text || "text-primary")} />
      <AlertDescription className={text}>{children}</AlertDescription>
    </Alert>
  )
}
