import { earsIssueLabel, type TraceabilityResult } from '../todos/earsTypes'

export interface SpecTraceHint {
  summary: string
  refinePrompt: string
  errorCount: number
  warningCount: number
}

const DEFAULT_REFINE =
  'Review for EARS consistency across requirements, design, and tasks.'

/** Build a refine-spec prompt and UI summary from a trace report. */
export function buildSpecTraceHint(result: TraceabilityResult): SpecTraceHint | null {
  if (result.ok && result.warning_count === 0) return null

  const issues = result.issues.filter(
    (i) => i.severity === 'error' || i.severity === 'warning'
  )
  const uncovered = result.links
    .filter((l) => !l.in_design || l.task_steps.length === 0)
    .map((l) => l.req_id)

  const lines: string[] = []
  for (const issue of issues.slice(0, 6)) {
    lines.push(earsIssueLabel(issue))
  }
  if (uncovered.length && lines.length < 6) {
    for (const reqId of uncovered.slice(0, 6 - lines.length)) {
      const link = result.links.find((l) => l.req_id === reqId)
      if (!link?.in_design) lines.push(`${reqId}: missing from design`)
      if (link && link.task_steps.length === 0) lines.push(`${reqId}: no implementation task step`)
    }
  }

  const summary =
    result.error_count > 0
      ? `${result.error_count} trace error(s)${result.warning_count ? `, ${result.warning_count} warning(s)` : ''}`
      : `${result.warning_count} trace warning(s)`

  const refinePrompt =
    lines.length > 0
      ? `Fix spec trace gaps:\n${lines.map((l) => `- ${l}`).join('\n')}\nAlign design and tasks_md with every REQ id.`
      : DEFAULT_REFINE

  return {
    summary,
    refinePrompt,
    errorCount: result.error_count,
    warningCount: result.warning_count,
  }
}

export function defaultRefinePrompt(): string {
  return DEFAULT_REFINE
}
