export interface WorkflowSnapshot {
  currentStep: number
  uploadedFileCount: number
  analyzedFileCount: number
  analyzedSheetCount: number
  analyzedRowCount: number
  savedConnectionCount: number
  hasSelectedConnection: boolean
  selectedSheetCount: number
  sheetsToCreate: number
  sheetsToMap: number
  createdTableCount: number
  recentOperationCount: number
  processingError?: string | null
}

export interface WorkflowRecommendation {
  id: string
  title: string
  detail: string
  tone: "info" | "warning" | "success"
}

export function calculateReadinessScore(snapshot: WorkflowSnapshot): number {
  let score = 8

  if (snapshot.uploadedFileCount > 0) score += 16
  if (snapshot.analyzedSheetCount > 0) score += 18
  if (snapshot.hasSelectedConnection) score += 20
  if (snapshot.selectedSheetCount > 0) score += 18
  if (snapshot.sheetsToCreate > 0) score += 10
  if (snapshot.createdTableCount > 0) score += 18
  if (snapshot.recentOperationCount > 0) score += 5
  if (snapshot.processingError) score -= 18

  return Math.max(0, Math.min(100, score))
}

export function getWorkflowBlockers(snapshot: WorkflowSnapshot): string[] {
  const blockers: string[] = []

  if (snapshot.uploadedFileCount === 0) {
    blockers.push("Upload one or more workbooks to start a run.")
  }

  if (snapshot.uploadedFileCount > 0 && snapshot.analyzedSheetCount === 0) {
    blockers.push("Analyze the uploaded files before choosing a destination.")
  }

  if (snapshot.analyzedSheetCount > 0 && !snapshot.hasSelectedConnection) {
    blockers.push("Choose a database connection so sheet planning can stay grounded in the actual target.")
  }

  if (snapshot.hasSelectedConnection && snapshot.selectedSheetCount === 0 && snapshot.currentStep >= 4) {
    blockers.push("Pick at least one sheet to continue into table creation.")
  }

  if (snapshot.processingError) {
    blockers.push(snapshot.processingError)
  }

  return blockers
}

export function getWorkflowRecommendations(snapshot: WorkflowSnapshot): WorkflowRecommendation[] {
  const recommendations: WorkflowRecommendation[] = []

  if (snapshot.uploadedFileCount === 0) {
    recommendations.push({
      id: "upload-first-batch",
      title: "Start with one representative workbook",
      detail: "A smaller first pass makes type detection and schema review faster before you commit to a full batch.",
      tone: "info",
    })
  }

  if (snapshot.uploadedFileCount > 0 && snapshot.analyzedSheetCount === 0) {
    recommendations.push({
      id: "analyze-before-connect",
      title: "Run analysis before touching the database",
      detail: "Surface row counts, sheet counts, and data shape early so the connection step becomes a deliberate decision instead of a guess.",
      tone: "warning",
    })
  }

  if (snapshot.analyzedRowCount > 25000) {
    recommendations.push({
      id: "large-batch",
      title: "Treat this as a high-volume import",
      detail: "Large row counts benefit from a tighter review pass on column types and null-heavy sheets before table creation.",
      tone: "warning",
    })
  }

  if (snapshot.savedConnectionCount > 0 && !snapshot.hasSelectedConnection) {
    recommendations.push({
      id: "reuse-connection",
      title: "Reuse a saved connection",
      detail: "Repeat runs are faster when the destination is selected from existing connection profiles instead of being re-entered each time.",
      tone: "info",
    })
  }

  if (snapshot.hasSelectedConnection && snapshot.selectedSheetCount > 0 && snapshot.sheetsToMap === 0) {
    recommendations.push({
      id: "create-plan",
      title: "Lean on fresh-table creation for now",
      detail: "The current flow is strongest when it creates and validates new tables end to end inside the same run.",
      tone: "success",
    })
  }

  if (snapshot.createdTableCount > 0) {
    recommendations.push({
      id: "review-preview",
      title: "Review preview rows before closing the run",
      detail: "A quick verification pass catches naming drift, date parsing issues, and unexpected null handling while context is still fresh.",
      tone: "success",
    })
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: "steady-progress",
      title: "The workflow is in a healthy state",
      detail: "The remaining work is mostly execution and verification, not setup.",
      tone: "success",
    })
  }

  return recommendations
}