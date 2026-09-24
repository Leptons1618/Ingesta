"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Search } from "lucide-react"

import { NAV_ITEMS, isNavItemActive } from "@/components/common/nav-items"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/**
 * Keyboard-first jump list. Escape is left to the dialog, which already closes
 * on it, so the palette only owns arrows and Enter.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return NAV_ITEMS
    return NAV_ITEMS.filter((item) =>
      `${item.label} ${item.href} ${item.description}`.toLowerCase().includes(needle)
    )
  }, [query])

  // Reopening always starts from a clean slate rather than the last search.
  useEffect(() => {
    if (!open) return
    setQuery("")
    setActive(0)
  }, [open])

  const activeIndex = results.length === 0 ? 0 : Math.min(active, results.length - 1)

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, results])

  function go(href: string) {
    onOpenChange(false)
    router.push(href)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive(results.length === 0 ? 0 : (activeIndex + 1) % results.length)
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive(results.length === 0 ? 0 : (activeIndex - 1 + results.length) % results.length)
      return
    }
    if (event.key === "Home") {
      event.preventDefault()
      setActive(0)
      return
    }
    if (event.key === "End") {
      event.preventDefault()
      setActive(Math.max(0, results.length - 1))
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const item = results[activeIndex]
      if (item) go(item.href)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[18%] max-w-lg translate-y-0 gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search the workspace and jump to a page.
        </DialogDescription>

        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            spellCheck={false}
            autoComplete="off"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-results"
            aria-activedescendant={results[activeIndex] ? `command-palette-option-${activeIndex}` : undefined}
            aria-label="Search pages"
            placeholder="Search pages…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            Esc
          </kbd>
        </div>

        <div id="command-palette-results" ref={listRef} role="listbox" aria-label="Pages" className="max-h-80 overflow-y-auto p-1">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nothing matches “{query}”.
            </p>
          ) : (
            results.map((item, index) => (
              <button
                id={`command-palette-option-${index}`}
                key={item.href}
                type="button"
                role="option"
                data-index={index}
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(item.href)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors duration-100",
                  index === activeIndex ? "bg-accent text-accent-foreground" : "text-foreground"
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                </span>
                {isNavItemActive(item.href, pathname) ? (
                  <span className="shrink-0 text-xs text-muted-foreground">Current</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
