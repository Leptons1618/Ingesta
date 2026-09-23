/**
 * Route-level loading UI. Every page renders inside `AppShell`, so this stands in
 * for the content area only: the sidebar, the theme toggle and ⌘K stay usable
 * while the next segment resolves.
 *
 * The skeleton mirrors the real page chrome (header, stat row, panel) so the
 * layout does not jump when the content lands.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="text-foreground">
      <div className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="space-y-2">
            <div className="h-6 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-72 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
        </div>
      </div>

      <main className="w-full space-y-8 px-6 py-8">
        <p className="sr-only">Loading this view</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="h-[4.75rem] animate-pulse rounded-2xl border border-border bg-muted/60"
            />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-xl border border-border bg-muted/60" />
      </main>
    </div>
  )
}
