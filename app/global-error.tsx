"use client"

import Link from "next/link"
/**
 * Last-resort boundary: it replaces the root layout, so it renders its own
 * `<html>`/`<body>` and imports nothing from the app — a failure in the shell,
 * the providers or the stylesheet must not be able to take this screen down too.
 * Hence the inline styles instead of theme classes.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          color: "CanvasText",
          background: "Canvas",
        }}
      >
        <main style={{ maxWidth: "34rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            Ingesta could not start
          </h1>
          <p style={{ margin: "0 0 1rem", opacity: 0.75, fontSize: "0.9rem", lineHeight: 1.5 }}>
            The application shell failed to load, so nothing below it could render. Reloading
            usually clears it.
          </p>
          <p
            style={{
              margin: "0 0 1rem",
              padding: "0.5rem 0.75rem",
              border: "1px solid rgba(127,127,127,0.4)",
              borderRadius: "0.375rem",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: "0.75rem",
              overflowWrap: "anywhere",
            }}
          >
            {error.message || "No error message was provided."}
            {error.digest ? ` · digest ${error.digest}` : ""}
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                cursor: "pointer",
                padding: "0.5rem 1rem",
                borderRadius: "0.375rem",
                border: "1px solid transparent",
                background: "#0d7c85",
                color: "#ffffff",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}
            >
              Try again
            </button>
            <Link
              href="/"
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.375rem",
                border: "1px solid rgba(127,127,127,0.4)",
                color: "inherit",
                fontSize: "0.875rem",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Back to dashboard
            </Link>
          </div>
        </main>
      </body>
    </html>
  )
}
