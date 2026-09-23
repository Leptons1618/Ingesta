import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Compact pill used to pick one item out of a visible set. */
export function ChipButton({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors",
        selected ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-muted/50",
        className,
      )}
    >
      {children}
    </button>
  )
}
