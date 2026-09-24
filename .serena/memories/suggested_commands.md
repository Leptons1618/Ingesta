# Ingesta commands

- Install: `corepack pnpm install`
- Development: `corepack pnpm dev`
- Production: `corepack pnpm build && corepack pnpm exec next start -p <free-port>`
- Domain assertions: `corepack pnpm check` (seven Bun scripts)
- Type check: `corepack pnpm check:types`
- Lint: `corepack pnpm lint`
- Clean Next output: `corepack pnpm clean`
- Bun is required for the assertion scripts even though the runtime app uses Node.
- For a port other than 3000 use `corepack pnpm exec next start -p 3100`; do not pass `-- -p` through the pnpm script.