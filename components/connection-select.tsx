"use client"

import { Star } from "lucide-react"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConnectionStorage } from "@/lib/storage"
import type { DatabaseConfig } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Picks one of the saved connection profiles. Every page that needs a database
 * target uses this, so "which connection am I pointed at" reads the same way
 * everywhere.
 */
export function ConnectionSelect({
  connections,
  value,
  onChange,
  placeholder = "Select a connection",
  disabled,
  className,
  id,
  ariaLabel,
}: {
  connections: DatabaseConfig[]
  /** The selected connection id. */
  value: string | null
  onChange: (config: DatabaseConfig | null) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  ariaLabel?: string
}) {
  const ordered = ConnectionStorage.sortForDisplay(connections)

  return (
    <Select
      value={value ?? undefined}
      disabled={disabled}
      onValueChange={(id) => onChange(connections.find((connection) => connection.id === id) ?? null)}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {ordered.map((connection) => (
          <SelectItem key={connection.id} value={connection.id}>
            <span className="flex min-w-0 items-center gap-2">
              {connection.favorite ? <Star className="h-3 w-3 shrink-0 fill-current text-primary" /> : null}
              <span className="truncate">{connection.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {connection.type === "sqlite" ? connection.database : `${connection.host ?? "?"}/${connection.database}`}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
