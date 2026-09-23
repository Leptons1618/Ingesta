# UX & Scalability Upgrade Brief

## Why this upgrade exists

The project already had strong core functionality (Excel parsing, schema inference, multi-database insertion), but the operational experience still depended heavily on user intuition and default runtime behavior.  
This upgrade introduces product-level guidance and execution-level controls so imports become easier to operate for first-time users and more stable for larger datasets.

---

## What changed

## 1) Workflow guidance embedded in the main journey

### Files
- `/home/runner/work/Ingesta/Ingesta/app/page.tsx`
- `/home/runner/work/Ingesta/Ingesta/lib/workflow-insights.ts`

### High-level behavior
- The primary page now computes a `WorkflowSnapshot` from live state (progress step, analyzed files/sheets/rows, selected connection, sheet selections, created tables, recent operation count, current processing error).
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
- `/home/runner/work/Ingesta/Ingesta/components/table-creation-interface.tsx`

### High-level behavior
- Added a dedicated execution settings panel allowing operators to control:
  - batch size,
  - null handling strategy,
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
- `/home/runner/work/Ingesta/Ingesta/app/api/database/insert-data/route.ts`

### High-level behavior
- Insert payload now supports optional `execution` options.
- Data is chunked server-side using bounded `batchSize`.
- Each chunk uses the existing `DatabaseManager.insertDataWithCleaning(...)` path.
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

- Existing clients that call `/api/database/insert-data` with only `config`, `tableName`, `data`, and `columnNames` continue to work.
- New behavior is additive and option-driven.
- The design intentionally avoids changing route shapes used by other critical workflow steps.

---

## Documentation updates

### Files updated
- `/home/runner/work/Ingesta/Ingesta/README.md`
- `/home/runner/work/Ingesta/Ingesta/docs/API_ROUTES.md`
- `/home/runner/work/Ingesta/Ingesta/docs/UX_SCALABILITY_UPGRADE.md` (this file)

### What is documented
- New UX guidance behavior and rationale.
- New import execution controls and intended usage.
- New API request/response shape for scalable batch insertion.

---

## Suggested next architectural iteration (future scope)

If you want true “massive scale” behavior beyond synchronous request execution, the next high-value step is asynchronous import jobs with persisted progress states and retry queues.  
This upgrade deliberately avoids that larger shift to keep changes safe, incremental, and compatible with the current architecture.
