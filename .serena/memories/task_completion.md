# Ingesta completion checks

1. Run `corepack pnpm check`.
2. Run `corepack pnpm check:types`.
3. Run `corepack pnpm lint`.
4. Run `corepack pnpm build`.
5. For UI changes, start the production build and exercise the changed route in a real browser at desktop and narrow viewport widths; inspect console errors and take screenshots when documentation is part of the task.
6. For import/database changes, retain the SQLite assertion scripts and verify partial-failure telemetry. Live PostgreSQL/MySQL/SQL Server coverage is not available in this workspace.