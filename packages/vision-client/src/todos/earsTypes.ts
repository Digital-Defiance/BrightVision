/** EARS lint report from Vision API (`POST …/lint-requirements`). */

export type EarsSeverity = 'error' | 'warning' | 'info'

export interface EarsIssue {
  code: string
  message: string
  severity: EarsSeverity
  line?: number | null
  req_id?: string | null
  todo_id?: string | null
}

export interface EarsClause {
  req_id?: string | null
  line: number
  text: string
  pattern: string
}

export interface EarsLintResult {
  ok: boolean
  error_count: number
  warning_count: number
  source_path?: string | null
  issues: EarsIssue[]
  clauses: EarsClause[]
}

export interface SpecFolderRecord {
  todo_id: string
  has_requirements: boolean
  has_design: boolean
  has_tasks: boolean
  req_ids: string[]
  requirements_ok?: boolean | null
  requirements_errors: number
}

export interface SpecIndexResult {
  ok: boolean
  error_count: number
  warning_count: number
  task_ids: string[]
  folders: SpecFolderRecord[]
  issues: EarsIssue[]
}

export interface TraceLink {
  req_id: string
  in_design: boolean
  task_steps: number[]
}

export interface TraceStep {
  number: number
  text: string
  done: boolean
  req_refs: string[]
}

export interface TraceabilityResult {
  ok: boolean
  error_count: number
  warning_count: number
  req_ids: string[]
  links: TraceLink[]
  steps: TraceStep[]
  design_headings: string[]
  issues: EarsIssue[]
}

export function earsIssueLabel(issue: EarsIssue): string {
  const loc =
    issue.line != null
      ? `line ${issue.line}`
      : issue.req_id
        ? issue.req_id
        : issue.todo_id
          ? issue.todo_id
          : ''
  const prefix = loc ? `${issue.code} (${loc})` : issue.code
  return `${prefix}: ${issue.message}`
}
