import { cn } from "@/lib/utils"

/**
 * Inline bar sparkline for headline metrics. Bars are laid out by flexbox
 * rather than SVG so they inherit the surrounding colour tokens for free.
 */
export function MiniBars({
  values,
  className,
  label,
}: {
  values: number[]
  className?: string
  label?: string
}) {
  const max = Math.max(1, ...values.map((value) => (Number.isFinite(value) ? value : 0)))

  return (
    <div
      data-slot="mini-bars"
      role="img"
      aria-label={label ?? `${values.length} values`}
      className={cn("flex h-8 items-end gap-0.5", className)}
    >
      {values.map((value, index) => {
        const safe = Number.isFinite(value) && value > 0 ? value : 0
        // A flat series still has to read as bars, hence the 6% floor.
        const height = safe === 0 ? "6%" : `${Math.max(8, Math.round((safe / max) * 100))}%`

        return (
          <span
            key={index}
            title={`${safe}`}
            className="w-full min-w-1 flex-1 rounded-sm bg-primary/40 transition-[height] duration-300 hover:bg-primary"
            style={{ height }}
          />
        )
      })}
    </div>
  )
}
