import { describe, expect, it } from 'vitest'
import { resumeStepFromStatuses, suitePlanKey } from './suiteResume'
import type { SuiteStepPlan } from './testSuiteClient'

const plan: SuiteStepPlan[] = [
  { id: 'a', label: 'step a', requiresOllama: false, touchesCorePort: false },
  { id: 'b', label: 'step b', requiresOllama: false, touchesCorePort: false },
  { id: 'c', label: 'step c', requiresOllama: true, touchesCorePort: true },
]

describe('suiteResume', () => {
  it('plan key changes when lanes change', () => {
    const base = suitePlanKey(plan, false, {})
    const phased = suitePlanKey(plan, false, { specGenPhased: true })
    expect(base).not.toBe(phased)
  })

  it('resume from first non-ok step', () => {
    expect(
      resumeStepFromStatuses(plan, [
        { id: 'a', status: 'ok' },
        { id: 'b', status: 'fail' },
        { id: 'c', status: 'pending' },
      ])?.id
    ).toBe('b')
  })

  it('resume null when all ok', () => {
    expect(
      resumeStepFromStatuses(plan, [
        { id: 'a', status: 'ok' },
        { id: 'b', status: 'ok' },
        { id: 'c', status: 'ok' },
      ])
    ).toBeNull()
  })
})
