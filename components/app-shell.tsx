"use client"

import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Menu, PanelLeftClose, PanelLeftOpen, Search, Sparkles, X } from "lucide-react"

import { CommandPalette } from "@/components/command-palette"
import { NAV_ITEMS, isNavItemActive, type NavItem } from "@/components/common/nav-items"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const COLLAPSE_KEY = "ingesta-shell-collapsed"

/** Full literals, not interpolations: Tailwind only sees what is written out. */
const EXPANDED_OFFSET = "lg:pl-[248px]"
const COLLAPSED_OFFSET = "lg:pl-[68px]"

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const active = isNavItemActive(item.href, pathname)

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors duration-150",
        collapsed ? "justify-center px-0" : "px-3",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-all duration-200",
          active ? "animate-in fade-in-0 zoom-in-95 opacity-100" : "scale-y-0 opacity-0"
        )}
      />
      <item.icon className="size-4 shrink-0" />
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
    </Link>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  )
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Sparkles className="size-4" />
      </span>
      {collapsed ? null : <span className="truncate font-semibold tracking-tight">Ingesta</span>}
    </Link>
  )
}

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
    </nav>
  )
}

/** Navigation frame every page renders inside. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Read after mount: the server has no access to the stored preference.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "true")
    } catch {
      setCollapsed(false)
    }
  }, [])

  useEffect(() => setDrawerOpen(false), [pathname])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      setPaletteOpen((open) => !open)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSE_KEY, String(next))
    } catch {
      // A blocked storage just means the preference is not remembered.
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <aside
        data-slot="sidebar"
        data-collapsed={collapsed}
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
          collapsed ? "w-[68px]" : "w-[248px]"
        )}
      >
        <div className={cn("flex h-14 shrink-0 items-center border-b border-sidebar-border", collapsed ? "justify-center px-2" : "gap-2 px-3")}>
          <Brand collapsed={collapsed} />
          {collapsed ? null : (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Collapse sidebar"
              onClick={toggleCollapsed}
              className="ml-auto size-7 text-muted-foreground"
            >
              <PanelLeftClose className="size-4" />
            </Button>
          )}
        </div>

        {collapsed ? (
          <div className="flex justify-center py-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Expand sidebar"
                  onClick={toggleCollapsed}
                  className="size-7 text-muted-foreground"
                >
                  <PanelLeftOpen className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand sidebar</TooltipContent>
            </Tooltip>
          </div>
        ) : null}

        <NavList collapsed={collapsed} />

        <div className={cn("shrink-0 border-t border-sidebar-border p-2", collapsed ? "flex flex-col items-center gap-2" : "flex items-center gap-2")}>
          <ThemeToggle />
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open command palette"
                  onClick={() => setPaletteOpen(true)}
                  className="size-9 text-muted-foreground"
                >
                  <Search className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Command palette · ⌘K</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="outline"
              onClick={() => setPaletteOpen(true)}
              className="min-w-0 flex-1 justify-start gap-2 text-muted-foreground"
            >
              <Search className="size-4" />
              Search
              <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
            </Button>
          )}
        </div>
      </aside>

      <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl data-[state=open]:animate-in data-[state=open]:slide-in-from-left-72 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left-72 duration-200 lg:hidden">
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Jump to a section of the workspace.
            </DialogPrimitive.Description>

            <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
              <Brand collapsed={false} />
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Close navigation" className="ml-auto size-8 text-muted-foreground">
                  <X className="size-4" />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <NavList collapsed={false} onNavigate={() => setDrawerOpen(false)} />
            <div className="shrink-0 border-t border-sidebar-border p-2">
              <ThemeToggle />
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div
        className={cn(
          "flex min-h-svh min-w-0 flex-1 flex-col transition-[padding] duration-200",
          collapsed ? COLLAPSED_OFFSET : EXPANDED_OFFSET
        )}
      >
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            onClick={() => setDrawerOpen(true)}
            className="size-8"
          >
            <Menu className="size-5" />
          </Button>
          <Brand collapsed={false} />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open command palette"
            onClick={() => setPaletteOpen(true)}
            className="ml-auto size-8 text-muted-foreground"
          >
            <Search className="size-4" />
          </Button>
        </header>

        {/* Keyed on the route so every navigation replays the reveal. */}
        <div key={pathname} className="page-reveal min-w-0 flex-1">
          {children}
        </div>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
