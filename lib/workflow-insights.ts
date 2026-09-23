/**
 * Decision support for the import wizard.
 *
 * This is a layer *over* the pipeline, not part of it: it reads the state the
 * page already holds, and says where the run stands, what is stopping it, and
 * what is worth doing next. Nothing here writes, fetches or mutates — which is
 * what keeps it honest and checkable.
 *
 * The stage list it reasons about is the same one `components/workflow-stepper.tsx`
 * renders; the numbers it reasons over are the ones the page already counted.
 */

import type { DatabaseType } from "@/lib/types"

/** Everything the guidance layer reads. Plain data, so it stays checkable. */
export interface WorkflowSnapshot {
  /** 1–7, the wizard stage the user is on. */
  step: number
  files: number
  /** Sheets found by the analysis, across every file. */
  sheets: number
  /** Rows found by the analysis, across every sheet. */
  rows: number
  connectionName: string | null
  connectionType: DatabaseType | null
  /** Sheets queued for table creation. */
  selectedSheets: number
  selectedRows: number
  createdTables: number
  failedTables: number
  /** Completed runs already in this browser's history. */
  recentRuns: number
  error: string | null
  busy: boolean
}

export interface WorkflowGuidance {
  /** 0–100: how much of a finished run is already in place. */
  readiness: number
  /** The next action for the stage the user is on, most important first. */
  blockers: string[]
  /** Worth doing, never required. At most three. */
  recommendations: string[]
}

/** Above this, batching is worth the operator's attention. */
const LARGE_RUN_ROWS = 5_000

const MAX_BLOCKERS = 2
const MAX_RECOMMENDATIONS = 3

/** What the stage is waiting for, in the order the stages run. */
const STAGE_ACTIONS: Record<number, string> = {
  1: "Select the workbooks to import.",
  2: "Check the detected sheets, then continue to the connection.",
  3: "Choose a saved connection, or save a new one.",
  4: "Select the sheets to import, then continue.",
  5: "Configure each sheet's schema, then create its table.",
  6: "Check the inserted rows, then finish the run to record it.",
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`
}

export function buildWorkflowGuidance(snapshot: WorkflowSnapshot): WorkflowGuidance {
  // Weights describe the run, not the screen: picking files is the cheapest step
  // and rows landing in a table is the point of the whole thing.
  const milestones: Array<[weight: number, reached: boolean]> = [
    [10, snapshot.files > 0],
    [15, snapshot.sheets > 0],
    [15, snapshot.connectionName !== null],
    [20, snapshot.selectedSheets > 0],
    [25, snapshot.createdTables > 0],
    [15, snapshot.step === 7],
  ]
  const readiness = milestones.reduce((total, [weight, reached]) => total + (reached ? weight : 0), 0)

  const blockers: string[] = []
  if (snapshot.step === 1 && snapshot.files === 0) {
    blockers.push(STAGE_ACTIONS[1])
  } else if (snapshot.step < 7) {
    blockers.push(STAGE_ACTIONS[snapshot.step] ?? "Continue to the next stage.")
  }
  if (snapshot.busy) {
    blockers.push("Waiting for the current step to finish.")
  }
  if (snapshot.error) {
    blockers.push("Clear the reported error before continuing.")
  }
  if (snapshot.failedTables > 0) {
    blockers.push(
      `${plural(snapshot.failedTables, "sheet")} failed. Fix the reported problem, then run the wizard again for those sheets.`,
    )
  }

  // Priority order, not insertion order: a failed run outranks a tip.
  const candidates: string[] = []
  if (snapshot.selectedRows > LARGE_RUN_ROWS && snapshot.step <= 5) {
    candidates.push(
      `${plural(snapshot.selectedRows, "row")} are queued. Set a batch size on the table step, so a failure only costs the batch it happened in.`,
    )
  }
  if (snapshot.selectedSheets > 1 && snapshot.step >= 5) {
    candidates.push(
      `${plural(snapshot.selectedSheets, "sheet")} are queued and each becomes its own table — rename them on the table step if the sheet names are not what you want in the database.`,
    )
  }
  if (snapshot.selectedSheets > 0 && snapshot.selectedRows === 0) {
    candidates.push("The selected sheets have no rows, so the tables will be created empty.")
  }
  if (snapshot.recentRuns > 0 && snapshot.step <= 2) {
    candidates.push(
      `${plural(snapshot.recentRuns, "earlier run")} are in this browser's history; the dashboard compares this run against them.`,
    )
  }

  return {
    readiness,
    blockers: blockers.slice(0, MAX_BLOCKERS),
    recommendations: candidates.slice(0, MAX_RECOMMENDATIONS),
  }
}
