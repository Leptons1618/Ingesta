import {
  Columns3,
  Database,
  LayoutDashboard,
  Settings,
  Table2,
  Upload,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  href: string
  label: string
  /** Shown by the command palette and as the collapsed sidebar tooltip. */
  description: string
  icon: LucideIcon
}

/** The single ordered list every navigation surface renders. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", description: "Workspace overview and recent activity", icon: LayoutDashboard },
  { href: "/import", label: "Import", description: "Upload spreadsheets and create tables", icon: Upload },
  { href: "/connections", label: "Connections", description: "Saved database connection profiles", icon: Database },
  { href: "/data", label: "Data", description: "Saved datasets and their pipelines", icon: Table2 },
  { href: "/tables", label: "Table Studio", description: "Browse and edit a database table", icon: Columns3 },
  { href: "/settings", label: "Settings", description: "Appearance, tables and guardrails", icon: Settings },
]

/** `/` is exact; every other entry also matches its nested routes. */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}
