# Ingesta conventions

- Shared domain shapes are defined once in `lib/types.ts`; do not redeclare them in pages/components.
- API routes parse through `readJson` inside `jsonRoute`; validate runtime unions before dispatching to db operations.
- User-facing text uses active verbs and explicit consequences. Empty/error/loading states use common primitives.
- Tailwind utility classes are preferred; `app/globals.css` owns tokens, themes, density, scrollbars, and motion.
- Browser persistence: localStorage for connections/history/settings, IndexedDB for datasets, database tables for snapshots.
- Existing check scripts are assertion programs, not a test framework. Add consumer-visible regression assertions there when appropriate.
- Docs are evidence-first; historical claims should be updated when the live tree changes.