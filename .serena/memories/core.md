# Ingesta project memory

- Six user routes: `/`, `/import`, `/connections`, `/data`, `/tables`, `/settings`; framework boundaries in `app/loading.tsx`, `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`.
- Sixteen JSON `POST` API routes under `app/api/*`; browser calls flow through `lib/api.ts`.
- Import is one-shot: selected workbook sheets become new tables via inferred schema, `lib/db/index.ts`, and `lib/import-execution.ts`.
- Datasets are `base grid + ordered operations` in IndexedDB via `lib/workspace.ts`; rollback replays a truncated operation list.
- Safety decisions live in `lib/guardrails.ts`; destructive UI actions flow through `ConfirmDialog`/guardrail components.
- Docs: `README.md`, `docs/ARCHITECTURE.md`, `docs/WORKSPACE.md`, `docs/API.md`, `docs/TRACKER.md`, `docs/USER_GUIDE.md`, `docs/SCREENSHOTS.md`.