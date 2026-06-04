import type { SuiteLaneOptions } from './testSuiteClient'
import type { SuiteStepPlan } from './testSuiteClient'

const STORAGE_KEY = 'bright-vision-test-lab-resume-v1'

export type SuiteResumeState = {
  planKey: string
  startFromStepId: string
  startFromLabel: string
  updatedAt: number
}

export function suitePlanKey(
  plan: SuiteStepPlan[],
  skipLlm: boolean,
  lanes: SuiteLaneOptions
): string {
  const ids = plan.map((s) => s.id).join('\0')
  const flags = [
    skipLlm ? '1' : '0',
    lanes.specGenPhased ? '1' : '0',
    lanes.llmRouter ? '1' : '0',
    lanes.cloudLlm ? '1' : '0',
    lanes.verifyEars ? '1' : '0',
    lanes.shippedScenarios ? '1' : '0',
    lanes.strictPhasedPytest ? '1' : '0',
  ].join('')
  return `${ids}|${flags}`
}

export function loadSuiteResume(): SuiteResumeState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SuiteResumeState
    if (!parsed?.startFromStepId || !parsed?.planKey) return null
    return parsed
  } catch {
    return null
  }
}

export function saveSuiteResume(state: SuiteResumeState | null): void {
  if (!state) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

/** First step to re-run: first non-ok in order, or null if all ok. */
export function resumeStepFromStatuses(
  plan: SuiteStepPlan[],
  steps: Array<{ id: string; status: string }>
): SuiteStepPlan | null {
  for (const p of plan) {
    const st = steps.find((s) => s.id === p.id)
    if (!st || st.status !== 'ok') return p
  }
  return null
}
