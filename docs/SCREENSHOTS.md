# Ingesta visual verification

The screenshots in this directory were captured against the production build after the UI fixes in
this pass. They show the six product pages plus a narrow mobile import view. No saved credentials or
workbook contents are present in the empty-state captures.

| Page | Route | Screenshot | Verified surface |
|---|---|---|---|
| Dashboard | `/` | `screenshots-dashboard.png` | Empty workspace, stat cards, quick actions, recent runs, datasets |
| Import | `/import` | `screenshots-import.png` | Seven-stage stepper, guidance, upload, readiness/empty state |
| Connections | `/connections` | `screenshots-connections.png` | Empty profile list and explorer entry point |
| Data | `/data` | `screenshots-data.png` | Dataset drop zone, empty selection, retention actions |
| Table Studio | `/tables` | `screenshots-tables.png` | Connection/table target, empty state, guarded workflow |
| Settings | `/settings` | `screenshots-settings.png` | Appearance, table preferences, guardrails, retention, storage |
| Import mobile | `/import` at 375px | `screenshots-import-mobile.png` | Narrow layout and contained horizontal overflow |

## Browser checks performed

- Opened all six routes against `next start` on the production build.
- Confirmed each route rendered its expected `h1` and no browser page errors.
- Exercised the command palette, theme control, sidebar collapse, mobile navigation drawer, settings
  switches and numeric retention inputs.
- Uploaded `tmp/ingesta-qa.xlsx`, analyzed it, and observed the Preview stage showing one sheet and
  three rows before database selection.
- Checked 375px viewport width. Dashboard quick-action cards originally overflowed by 5px; the
  cards now use `min-w-0`, and the dashboard measurement is contained within the viewport.
- Verified the six route screenshots show the empty state intentionally; no connection or database
  credentials were available in the browser profile.
