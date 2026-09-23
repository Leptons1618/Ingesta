"use client"

import Link from "next/link"
import { LayoutDashboard, RotateCcw, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Route error boundary. It renders inside `AppShell`, so the navigation, the
 * theme toggle and ⌘K keep working while the failed segment is replaced.
 *
 * `reset` re-renders the segment; it is the only recovery that keeps the user
 * where they were, so it is the primary action.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main role="alert" className="mx-auto w-full max-w-3xl px-6 py-16">
      <Card className="card-shell">
        <CardHeader>
          <span className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive [&_svg]:size-5">
            <TriangleAlert />
          </span>
          <CardTitle className="text-lg">This view stopped working</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The rest of the workspace is unaffected. Your saved connections, datasets and run history
            are stored separately from this screen.
          </p>
          <p className="rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs break-words">
            {error.message || "The page threw without a message."}
            {error.digest ? ` · digest ${error.digest}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={reset}>
              <RotateCcw />
              Try again
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">
                <LayoutDashboard />
                Back to dashboard
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
