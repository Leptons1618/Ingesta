# Ingesta tech stack

- Next.js 15.5.12 App Router, React 19, TypeScript 5.9, Tailwind CSS v4, Radix UI/shadcn-style wrappers, Zustand, next-themes, Lucide.
- Database drivers: `pg`, `mysql2`, `mssql`, `sqlite3`; only SQLite is exercised live in repository checks.
- Spreadsheet parsing/export: pinned `xlsx` 0.18.5.
- Package manager: pnpm 10.15.0. Node engine is >=20; `.nvmrc` pins Node 20.
- Lint: ESLint 9 CLI with `eslint-config-next`; config is `eslint.config.mjs`.
- Production build does not suppress TypeScript or lint errors: `next.config.mjs` has no ignore flags.