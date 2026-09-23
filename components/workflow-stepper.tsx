import { Check, Database, FileSpreadsheet, Layers3, TableProperties, Upload, WandSparkles } from "lucide-react"

/** The workflow, in order. One source of truth for the stepper and the stage copy. */
export const WORKFLOW_STAGES = [
  { name: "Upload", title: "Upload Excel files", description: "Add one or more workbooks, then analyze them.", icon: Upload },
  { name: "Preview", title: "Preview workbook data", description: "Check sheets and sample rows before choosing the destination.", icon: FileSpreadsheet },
  { name: "Database", title: "Choose a database", description: "Use a saved connection or create a new one.", icon: Database },
  { name: "Sheets", title: "Select sheets", description: "Pick the sheets that should become tables in this run.", icon: Layers3 },
  { name: "Tables", title: "Create tables", description: "Review the inferred schema and create the selected tables.", icon: WandSparkles },
  { name: "Verify", title: "Verify imported data", description: "Preview the created tables before closing the run.", icon: TableProperties },
  { name: "Done", title: "Run summary", description: "Review the completed run and start the next one.", icon: Check },
] as const

export function WorkflowStepper({ current }: { current: number }) {
  return (
    <div className="rounded-xl border bg-card p-2">
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        {WORKFLOW_STAGES.map((stage, index) => {
          const step = index + 1
          const Icon = stage.icon
          const isCurrent = step === current
          const isComplete = step < current

          return (
            <li key={stage.name} className="min-w-0">
              <div
                aria-current={isCurrent ? "step" : undefined}
                className={`flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : isComplete
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                    isCurrent
                      ? "border-primary-foreground/30"
                      : isComplete
                        ? "border-primary/20 bg-primary text-primary-foreground"
                        : "border-border"
                  }`}
                >
                  {isComplete ? <Check className="h-3.5 w-3.5" /> : step}
                </span>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{stage.name}</span>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
