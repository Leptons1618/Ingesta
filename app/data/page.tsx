"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Table2 } from "lucide-react"

import {
  ConfirmDialog,
  EmptyState,
  LoadingCard,
  PageHeader,
  Section,
  StatusAlert,
  type DataGridSort,
} from "@/components/common"
import { DatasetList } from "@/components/data/dataset-list"
import { ExportPanel } from "@/components/data/export-panel"
import { GridPanel, type GridFocus } from "@/components/data/grid-panel"
import { OperationHistory } from "@/components/data/history-list"
import { OperationsPanel } from "@/components/data/operations-panel"
import { ValidatePanel } from "@/components/data/validate-panel"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { readGridsFromFile } from "@/lib/export"
import { assessDropTable, assessLargeImport, assessRestoreSnapshot } from "@/lib/guardrails"
import { applyOperation, findingsByCell, gridBytes, suggestedRules, toEntry, validateGrid } from "@/lib/operations"
import { useAppSettingsStore } from "@/lib/settings"
import { toast } from "@/lib/toast"
import { coerceCell } from "@/lib/transform"
import type { Dataset, DatasetSummary, DataOperation, GuardrailAssessment, ValidationRule } from "@/lib/types"
import { errorMessage, formatRelativeTime, newId } from "@/lib/utils"
import { Workspace, datasetGrid } from "@/lib/workspace"

const TABS = [
  { value: "grid", label: "Grid" },
  { value: "operations", label: "Operations" },
  { value: "history", label: "History" },
  { value: "validate", label: "Validate" },
  { value: "export", label: "Export" },
] as const

type TabValue = (typeof TABS)[number]["value"]

/** A destructive action waits for the one dialog, so no gate can be bypassed. */
interface PendingConfirmation {
  assessment: GuardrailAssessment
  confirmLabel: string
  run: () => Promise<void> | void
}

/** Only ever rendered while the dialog is closed. */
const NO_ASSESSMENT: GuardrailAssessment = { risk: "safe", title: "", summary: "", warnings: [] }

/**
 * The dataset explorer.
 *
 * A dataset is always its base grid plus an ordered list of operations, so the
 * page never holds a second copy of the rows: the grid on screen is replayed
 * from the stored dataset, and every change is written back as either a new
 * operation or an edit to the base grid.
 */
export default function DataPage() {
  const retention = useAppSettingsStore((state) => state.retention)

  const [datasets, setDatasets] = useState<DatasetSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDataset, setLoadingDataset] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabValue>("grid")

  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<DataGridSort | null>(null)
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  const [rules, setRules] = useState<ValidationRule[]>([])
  const [focus, setFocus] = useState<GridFocus | null>(null)

  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  const pruned = useRef(false)

  const grid = useMemo(() => (dataset ? datasetGrid(dataset) : null), [dataset])
  const findings = useMemo(() => (grid ? validateGrid(grid, rules) : []), [grid, rules])
  const flaggedCells = useMemo(
    () => (grid ? findingsByCell(grid, findings) : new Map<string, "error" | "warning">()),
    [grid, findings],
  )

  const reloadList = useCallback(async () => {
    const summaries = await Workspace.list()
    setDatasets(summaries)
    return summaries
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      setLoadingList(true)
      try {
        const summaries = await Workspace.list()
        if (cancelled) return
        setDatasets(summaries)
        setSelectedId((current) => current ?? summaries[0]?.id ?? null)
        setError(null)

        // Retention is enforced once per mount, and only removes what the policy
        // allows. The user is told what went instead of finding it missing later.
        if (pruned.current) return
        pruned.current = true

        const result = await Workspace.prune(retention)
        if (cancelled || result.removed.length === 0) return

        const remaining = await Workspace.list()
        if (cancelled) return
        setDatasets(remaining)
        setSelectedId((current) => (current && remaining.some((entry) => entry.id === current) ? current : (remaining[0]?.id ?? null)))
        toast.warning(
          `Pruned ${result.removed.length} dataset${result.removed.length === 1 ? "" : "s"}`,
          `${result.removed.map((entry) => entry.name).join(", ")} — the retention policy keeps ${retention.maxDatasets} datasets${
            retention.datasetTtlDays > 0 ? ` and prunes anything untouched for ${retention.datasetTtlDays} days` : ""
          }.`,
        )
      } catch (caught) {
        if (!cancelled) setError(errorMessage(caught))
      } finally {
        if (!cancelled) setLoadingList(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [retention])

  useEffect(() => {
    if (!selectedId) {
      setDataset(null)
      return
    }

    let cancelled = false
    setLoadingDataset(true)

    void Workspace.get(selectedId)
      .then((found) => {
        if (cancelled) return
        setDataset(found)
        // A different dataset must not inherit the previous view or its rules.
        setSearch("")
        setSort(null)
        setHiddenColumns(new Set())
        setFocus(null)
        setTab("grid")
      })
      .catch((caught) => {
        if (!cancelled) setError(errorMessage(caught))
      })
      .finally(() => {
        if (!cancelled) setLoadingDataset(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedId])

  // Seeded from the columns, but only when the dataset or its columns change —
  // editing a cell must not wipe rules the user added by hand.
  const ruleKey = dataset && grid ? `${dataset.id}|${grid.columns.map((column) => column.name).join("\u0000")}` : ""
  useEffect(() => {
    setRules(grid ? suggestedRules(grid) : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleKey])

  const editCell = useCallback(
    async (rowIndex: number, columnIndex: number, value: unknown) => {
      // The visible grid is only the base grid while no operation has run, so
      // an edit can only be written back when there is nothing to replay.
      if (!dataset || dataset.operations.length > 0) return
      const row = dataset.base.rows[rowIndex]
      const column = dataset.base.columns[columnIndex]
      if (!row || !column) return

      const edited = row.slice()
      edited[columnIndex] = coerceCell(value, column.type)
      const rows = dataset.base.rows.slice()
      rows[rowIndex] = edited

      const next: Dataset = {
        ...dataset,
        base: { columns: dataset.base.columns, rows },
        updatedAt: new Date().toISOString(),
      }

      try {
        await Workspace.put(next)
        setDataset(next)
        // Only the size and the timestamp can change here, so the summaries do
        // not need every dataset in the workspace to be read back.
        setDatasets((current) =>
          current.map((entry) =>
            entry.id === next.id ? { ...entry, bytes: gridBytes(next.base), updatedAt: next.updatedAt } : entry,
          ),
        )
      } catch (caught) {
        toast.error("Could not save the edit", errorMessage(caught))
      }
    },
    [dataset],
  )

  const applyDataOperation = useCallback(
    async (operation: DataOperation) => {
      if (!dataset || !grid) return
      setBusy(true)
      try {
        const outcome = applyOperation(grid, operation)
        const next: Dataset = {
          ...dataset,
          operations: [...dataset.operations, toEntry(operation, outcome.effect)],
          updatedAt: new Date().toISOString(),
        }
        await Workspace.put(next)
        setDataset(next)
        await reloadList()
        toast.success(
          "Operation applied",
          `${outcome.effect.rowsIn.toLocaleString()} → ${outcome.effect.rowsOut.toLocaleString()} rows · ${outcome.effect.columnsIn} → ${outcome.effect.columnsOut} columns`,
        )
      } catch (caught) {
        toast.error("The operation could not be applied", errorMessage(caught))
      } finally {
        setBusy(false)
      }
    },
    [dataset, grid, reloadList],
  )

  const rollback = useCallback(
    async (index: number) => {
      if (!dataset) return
      setBusy(true)
      try {
        const next: Dataset = {
          ...dataset,
          operations: dataset.operations.slice(0, index),
          updatedAt: new Date().toISOString(),
        }
        await Workspace.put(next)
        setDataset(next)
        await reloadList()
        toast.success(
          index === 0 ? "Reset to the source data" : `Rolled back to ${index} operation${index === 1 ? "" : "s"}`,
        )
      } catch (caught) {
        toast.error("The rollback failed", errorMessage(caught))
      } finally {
        setBusy(false)
      }
    },
    [dataset, reloadList],
  )

  const requestRollback = useCallback(
    (index: number) => {
      if (!dataset) return
      // Dropping a single operation is the ordinary case and runs immediately;
      // discarding several at once is worth a confirmation.
      if (dataset.operations.length - index <= 1) {
        void rollback(index)
        return
      }

      const previous = dataset.operations[index - 1]
      setConfirmation({
        confirmLabel: "Roll back",
        // Reverting to an earlier point is what restoring a snapshot assesses:
        // the current contents are replaced by an earlier state, and the
        // dataset's name has to be typed to confirm it.
        assessment: assessRestoreSnapshot(
          {
            name: index === 0 ? "the source data" : `step ${index}`,
            table: dataset.name,
            rowCount: index === 0 ? dataset.base.rows.length : previous.effect.rowsOut,
            createdAt: previous?.createdAt ?? dataset.createdAt,
          },
          grid?.rows.length ?? 0,
        ),
        run: () => rollback(index),
      })
    },
    [dataset, grid, rollback],
  )

  const importFiles = useCallback(
    async (files: File[]) => {
      setBusy(true)
      setError(null)
      const created: Dataset[] = []
      const problems: string[] = []

      try {
        for (const file of files) {
          const { sheets, errors } = await readGridsFromFile(file)
          problems.push(...errors)
          const fileBase = file.name.replace(/\.[^.]+$/, "")

          for (const sheet of sheets) {
            const clamped = Workspace.clampRows(sheet.grid, retention.maxRowsPerDataset)
            if (clamped.dropped > 0) {
              const assessment = assessLargeImport(sheet.grid.rows.length, retention.maxRowsPerDataset)
              if (assessment) toast.warning(assessment.title, `${file.name} · ${assessment.summary}`)
            }

            const now = new Date().toISOString()
            created.push({
              id: newId("ds"),
              // A single-sheet workbook reads better named after the file than
              // after whatever the sheet happens to be called.
              name: sheets.length === 1 ? fileBase : `${fileBase} · ${sheet.name}`,
              sourceFile: file.name,
              sheetName: sheet.name,
              base: clamped.grid,
              operations: [],
              createdAt: now,
              updatedAt: now,
            })
          }
        }

        for (const entry of created) await Workspace.put(entry)
        if (created.length > 0) await reloadList()

        if (created.length > 0) {
          setSelectedId(created[0].id)
          toast.success(
            `Added ${created.length} dataset${created.length === 1 ? "" : "s"}`,
            created.map((entry) => entry.name).join(", "),
          )
        } else if (problems.length === 0) {
          toast.warning("Nothing to import", "Those files held no rows to store.")
        }
        for (const problem of problems) toast.error("Could not read a file", problem)
      } catch (caught) {
        setError(errorMessage(caught))
        toast.error("The import failed", errorMessage(caught))
      } finally {
        setBusy(false)
      }
    },
    [reloadList, retention.maxRowsPerDataset],
  )

  const renameDataset = useCallback(
    async (id: string, name: string) => {
      setBusy(true)
      try {
        const found = await Workspace.get(id)
        if (!found) return
        const next: Dataset = { ...found, name, updatedAt: new Date().toISOString() }
        await Workspace.put(next)
        if (id === selectedId) setDataset(next)
        await reloadList()
        toast.success("Dataset renamed", name)
      } catch (caught) {
        toast.error("Could not rename the dataset", errorMessage(caught))
      } finally {
        setBusy(false)
      }
    },
    [reloadList, selectedId],
  )

  const duplicateDataset = useCallback(
    async (id: string) => {
      setBusy(true)
      try {
        const found = await Workspace.get(id)
        if (!found) return
        const now = new Date().toISOString()
        const copy: Dataset = { ...found, id: newId("ds"), name: `${found.name} copy`, createdAt: now, updatedAt: now }
        await Workspace.put(copy)
        await reloadList()
        setSelectedId(copy.id)
        toast.success("Dataset duplicated", copy.name)
      } catch (caught) {
        toast.error("Could not duplicate the dataset", errorMessage(caught))
      } finally {
        setBusy(false)
      }
    },
    [reloadList],
  )

  const deleteDataset = useCallback(
    async (id: string) => {
      setBusy(true)
      try {
        await Workspace.remove(id)
        const summaries = await reloadList()
        if (id === selectedId) setSelectedId(summaries[0]?.id ?? null)
        toast.success("Dataset deleted")
      } catch (caught) {
        toast.error("Could not delete the dataset", errorMessage(caught))
      } finally {
        setBusy(false)
      }
    },
    [reloadList, selectedId],
  )

  const clearAll = useCallback(async () => {
    setBusy(true)
    try {
      await Workspace.clear()
      setDatasets([])
      setSelectedId(null)
      setDataset(null)
      toast.success("Workspace cleared")
    } catch (caught) {
      toast.error("Could not clear the workspace", errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [])

  const pruneNow = useCallback(async () => {
    setBusy(true)
    try {
      const result = await Workspace.prune(retention)
      const summaries = await reloadList()
      if (selectedId && !summaries.some((entry) => entry.id === selectedId)) setSelectedId(summaries[0]?.id ?? null)

      if (result.removed.length === 0) {
        toast.info("Nothing to prune", `The policy allows ${retention.maxDatasets} datasets and none have aged out.`)
      } else {
        toast.success(
          `Pruned ${result.removed.length} dataset${result.removed.length === 1 ? "" : "s"}`,
          result.removed.map((entry) => entry.name).join(", "),
        )
      }
    } catch (caught) {
      toast.error("Pruning failed", errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [reloadList, retention, selectedId])

  const jumpToRow = useCallback((row: number) => {
    // A finding's row is an index into the grid, so the view has to be showing
    // the grid in its own order before the scroll can land on the right row.
    setSearch("")
    setSort(null)
    setFocus((current) => ({ row, token: (current?.token ?? 0) + 1 }))
    setTab("grid")
  }, [])

  const confirmAction = async () => {
    if (!confirmation) return
    setConfirmBusy(true)
    try {
      await confirmation.run()
    } finally {
      setConfirmBusy(false)
      setConfirmation(null)
    }
  }

  const editable = Boolean(dataset && dataset.operations.length === 0)
  const editHint = editable
    ? "Double-click a cell to edit it. Edits go to the source grid and are saved in this browser."
    : "Cell editing writes to the source grid, so roll the operations back in History before editing cells."

  return (
    <>
      <PageHeader
        title="Data"
        description="Saved datasets: reshape, validate and export a sheet without touching a database."
        badge={
          <Badge variant="outline">
            {datasets.length} dataset{datasets.length === 1 ? "" : "s"}
          </Badge>
        }
      />

      <main className="w-full space-y-6 px-6 py-8">
        {error ? <StatusAlert tone="error">{error}</StatusAlert> : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <DatasetList
            datasets={datasets}
            selectedId={selectedId}
            retention={retention}
            loading={loadingList}
            busy={busy}
            onSelect={setSelectedId}
            onImport={(files) => void importFiles(files)}
            onRename={(id, name) => void renameDataset(id, name)}
            onDuplicate={(id) => void duplicateDataset(id)}
            onDelete={(id) => {
              const summary = datasets.find((entry) => entry.id === id)
              if (!summary) return
              setConfirmation({
                confirmLabel: "Delete dataset",
                // The workspace is not a database, but "this object and every
                // row in it is removed" is exactly what dropping a table
                // assesses — including typing the name to confirm.
                assessment: assessDropTable(summary.name, summary.rowCount),
                run: () => deleteDataset(id),
              })
            }}
            onPrune={() => void pruneNow()}
            onClearAll={() => {
              const rows = datasets.reduce((total, entry) => total + entry.rowCount, 0)
              setConfirmation({
                confirmLabel: "Delete all datasets",
                assessment: assessDropTable("every dataset", rows),
                run: clearAll,
              })
            }}
          />

          <div className="min-w-0 space-y-6">
            {loadingDataset ? (
              <Section title="Dataset">
                <LoadingCard label="Loading the dataset" />
              </Section>
            ) : !dataset || !grid ? (
              <EmptyState
                icon={<Table2 className="h-5 w-5" />}
                title="No dataset selected"
                description={
                  loadingList
                    ? "Reading the workspace."
                    : "Add a workbook or CSV on the left, then pick it here to explore its rows."
                }
              />
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold tracking-tight">{dataset.name}</h2>
                    <p className="truncate text-sm text-muted-foreground">
                      {dataset.sourceFile} · sheet “{dataset.sheetName}” · updated{" "}
                      {formatRelativeTime(dataset.updatedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{grid.rows.length.toLocaleString()} rows</Badge>
                    <Badge variant="outline">{grid.columns.length} columns</Badge>
                    <Badge variant="outline">
                      {dataset.operations.length} operation{dataset.operations.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                </div>

                <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)}>
                  <TabsList className="h-auto w-full max-w-xl">
                    {TABS.map((entry) => (
                      <TabsTrigger key={entry.value} value={entry.value}>
                        {entry.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  <TabsContent value="grid">
                    <GridPanel
                      grid={grid}
                      baseRowCount={dataset.base.rows.length}
                      search={search}
                      onSearchChange={setSearch}
                      sort={sort}
                      onSortChange={setSort}
                      hiddenColumns={hiddenColumns}
                      onHiddenColumnsChange={setHiddenColumns}
                      flaggedCells={flaggedCells}
                      editable={editable}
                      editHint={editHint}
                      onCellChange={(rowIndex, columnIndex, value) => void editCell(rowIndex, columnIndex, value)}
                      focus={focus}
                      busy={busy}
                    />
                  </TabsContent>

                  <TabsContent value="operations">
                    <OperationsPanel
                      grid={grid}
                      appliedCount={dataset.operations.length}
                      onApply={(operation) => void applyDataOperation(operation)}
                      busy={busy}
                    />
                  </TabsContent>

                  <TabsContent value="history">
                    <Section
                      title="History"
                      description="Rolling back truncates the list and replays the rest, so any earlier state is one click away."
                    >
                      <OperationHistory
                        entries={dataset.operations}
                        baseRows={dataset.base.rows.length}
                        disabled={busy}
                        onRollback={requestRollback}
                        onClear={() => requestRollback(0)}
                      />
                    </Section>
                  </TabsContent>

                  <TabsContent value="validate">
                    <ValidatePanel
                      grid={grid}
                      datasetName={dataset.name}
                      rules={rules}
                      onRulesChange={setRules}
                      findings={findings}
                      onJumpToRow={jumpToRow}
                    />
                  </TabsContent>

                  <TabsContent value="export">
                    <ExportPanel grid={grid} datasetName={dataset.name} />
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </div>
      </main>

      <ConfirmDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null)
        }}
        assessment={confirmation?.assessment ?? NO_ASSESSMENT}
        confirmLabel={confirmation?.confirmLabel}
        busy={confirmBusy}
        onConfirm={() => void confirmAction()}
      />
    </>
  )
}
