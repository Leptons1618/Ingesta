# UX & Scalability Upgrade Brief

## Why this upgrade exists

The project already had strong core functionality (Excel parsing, schema inference, multi-database insertion), but the operational experience still depended heavily on user intuition and default runtime behavior.  
This upgrade introduces product-level guidance and execution-level controls so imports become easier to operate for first-time users and more stable for larger datasets.

> This brief was written against an older tree — its paths were `/home/runner/work/Ingesta/Ingesta/...`,
> its insert route no longer exists, and it referenced a `DatabaseManager` that has since been split
> into `lib/db/`. It is kept as the brief, with the paths and the two claims that do not hold here
> corrected inline. What was actually built is recorded in
> [TRACKER.md](TRACKER.md#import-execution-and-guidance).

---

## What changed

## 1) Workflow guidance embedded in the main journey

### Files
- `app/import/page.tsx` (the wizard; it was `app/page.tsx` in the tree this was written against)
- `lib/workflow-insights.ts`
- `components/workflow-guidance.tsx` (the panel)

### High-level behavior
- The primary page computes a `WorkflowSnapshot` from live state (progress step, analyzed files/sheets/rows, selected connection, sheet selections, created tables, recent run count, current processing error, whether a step is in flight).
- From that snapshot, it renders:
  - readiness score,
  - top blockers,
  - top recommendations.

### Architectural justification
- This is a **decision-support layer** over the existing pipeline, not a rewrite of pipeline logic.
- By deriving guidance from existing state instead of introducing new state machines, it stays low-risk and composable with current flows.
- It improves usability without changing backend contracts.

### Value
- Reduces “what should I do next?” ambiguity.
- Surfaces likely failure points early (for example, attempting table creation before foundational setup is complete).

---

## 2) Import execution controls in the table-creation experience

### File
- `components/table-creation-interface.tsx`
- `lib/import-execution.ts` (the policy the panel edits)

### High-level behavior
- A dedicated execution settings panel allowing operators to control:
  - batch size,
  - blank-cell handling — write NULL, or drop the row (`blankCells`). The brief called this "null
    handling strategy"; there is no mode that substitutes `0`, `false` or today's date, because that
    behaviour was removed on purpose and is not coming back,
  - skip-empty-rows behavior,
  - string trimming behavior,
  - optional type conversion,
  - continue-on-batch-error behavior.
- These settings are sent with insert requests and reflected in success messages.

### Architectural justification
- This keeps the UX close to where users make schema and import decisions, which reduces context switching.
- It avoids hidden “magic defaults” by making runtime behavior explicit.
- It separates **business intent** (table schema) from **execution policy** (how to process rows at scale), which is a cleaner architectural boundary.

### Value
- Improves operator control and predictability.
- Makes the flow suitable for both small ad-hoc imports and larger operational imports.

---

## 3) Batched insertion and batch-level telemetry in API

### File
- `app/api/insert-data/route.ts` (the route this brief names, `app/api/database/insert-data/route.ts`,
  no longer exists)

### High-level behavior
- Insert payload now supports optional `execution` options.
- Data is chunked server-side using bounded `batchSize`.
- Each chunk is its own transaction over one session, through `insertDataInBatches` in
  `lib/db/index.ts`. The `DatabaseManager.insertDataWithCleaning(...)` path this brief names was
  deleted in the refactor; the equivalent today is `insertData`, which delegates to
  `insertDataInBatches` with `batchSize: 0` and keeps its all-or-nothing contract.
- Response now includes:
  - inserted/skipped row totals,
  - warnings,
  - batch accounting (`totalBatches`, `processedBatches`, `failedBatches`),
  - chunk-level errors,
  - duration.

### Architectural justification
- Reusing the existing insertion/cleaning service prevents duplicated persistence logic.
- Chunking at the API boundary is a pragmatic scale step: it limits per-pass payload pressure and localizes failures without introducing heavy async job infrastructure.
- Returning batch telemetry makes operational troubleshooting significantly easier and enables future observability integrations.

### Value
- Better resilience for large imports.
- Better diagnostics during partial failures.
- Backward-compatible defaults for callers that do not pass execution options.

---

## Backward compatibility and risk posture

- Existing clients that call `/api/insert-data` with only `config`, `tableName`, `data`, and `columnNames` continue to work, in one transaction, exactly as before. A failed batch is still a 500 — it now carries the telemetry alongside the message.
- New behavior is additive and option-driven.
- The design intentionally avoids changing route shapes used by other critical workflow steps.

---

## Documentation updates

### Files updated
- `README.md` (features, checks table, project structure)
- `docs/API.md` (the `POST /api/insert-data` contract; `docs/API_ROUTES.md` does not exist in this tree)
- `docs/ARCHITECTURE.md` (the insert path and the guidance layer)
- `docs/TRACKER.md` (the record of what was built and how it was verified)

### What is documented
- New UX guidance behavior and rationale.
- New import execution controls and intended usage.
- New API request/response shape for scalable batch insertion.

---

## Suggested next architectural iteration (future scope)

If you want true “massive scale” behavior beyond synchronous request execution, the next high-value step is asynchronous import jobs with persisted progress states and retry queues.  
This upgrade deliberately avoids that larger shift to keep changes safe, incremental, and compatible with the current architecture.

Two things would have to move first, and both are in the tracker's backlog: a partial batch failure
leaves the batches that already committed in the table, and nothing retries just the failed batch.
An asynchronous job with persisted progress and a retry queue is the natural home for both.
