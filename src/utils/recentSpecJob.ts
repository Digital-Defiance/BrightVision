import type { SpecLayerSection } from './specWizard'

export type SpecJobOutcome = 'running' | 'saved' | 'ears_blocked' | 'error' | 'aborted' | 'session_lost'

export interface RecentSpecJob {
  id: string
  outcome: SpecJobOutcome
  prompt: string | null
  mode: 'generate' | 'refine' | null
  section: SpecLayerSection | null
}

export function specJobChipLabel(job: RecentSpecJob): string {
  const short = job.id.slice(0, 8)
  switch (job.outcome) {
    case 'running':
      return `Spec job ${short}…`
    case 'saved':
      return `Spec job ${short}… saved`
    case 'ears_blocked':
      return `Spec job ${short}… EARS blocked`
    case 'aborted':
      return `Spec job ${short}… cancelled`
    case 'session_lost':
      return `Spec job ${short}… session ended`
    case 'error':
      return `Spec job ${short}… failed`
  }
}

export function specJobChipColor(
  outcome: SpecJobOutcome
): 'info' | 'success' | 'warning' | 'error' {
  switch (outcome) {
    case 'running':
      return 'info'
    case 'saved':
      return 'success'
    case 'ears_blocked':
      return 'warning'
    case 'error':
    case 'session_lost':
      return 'error'
    case 'aborted':
      return 'warning'
  }
}
