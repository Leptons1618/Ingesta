import { CheckCircle2, CircleAlert, Lightbulb } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { WorkflowGuidance } from "@/lib/workflow-insights"

/**
 * Readiness, blockers and recommendations for the run in progress. Presentational
 * only: every sentence it shows comes from `lib/workflow-insights.ts`, which reads
 * the same state the rest of the wizard renders.
 */
export function WorkflowGuidancePanel({ guidance }: { guidance: WorkflowGuidance }) {
  return (
    <Card className="card-shell">
      <CardHeader>
        <CardTitle className="text-base">Where this run stands</CardTitle>
        <CardDescription>
          {guidance.readiness}% of a finished run is in place. Nothing here is required reading — it is what the
          workspace already knows about this run.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={guidance.readiness} aria-label="Run readiness" />

        {guidance.blockers.length > 0 ? (
          <ul className="space-y-1.5">
            {guidance.blockers.map((blocker) => (
              <li key={blocker} className="flex items-start gap-2 text-sm">
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>{blocker}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 aria-hidden className="size-4 shrink-0" />
            Nothing is blocking this run.
          </p>
        )}

        {guidance.recommendations.length > 0 ? (
          <div className="space-y-1.5 border-t pt-3">
            {guidance.recommendations.map((recommendation) => (
              <p key={recommendation} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{recommendation}</span>
              </p>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
