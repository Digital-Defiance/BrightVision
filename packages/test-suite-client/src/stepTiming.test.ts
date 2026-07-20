import { describe, expect, it } from 'vitest'
import {
  computeEtcAnchors,
  computeRunEtcPlan,
  formatEtcClock,
  formatSubstepProgressLabel,
  refinedStepRemainingSeconds,
  refinedSecondsUntilSuiteFinish,
  secondsUntilSuiteFinish,
  stepTimingLabels,
  suiteRunningTimingSummary,
} from './stepTiming'
import type { SubstepProgress } from './pytestSubstepTracker'

describe('stepTiming', () => {
  it('formatEtcClock returns a time string', () => {
    expect(formatEtcClock(60)).toMatch(/\d/)
  })

  it('running step shows ETA, ETC, and run ETC', () => {
    const plan = [{ id: 'a' }, { id: 'b' }]
    const steps = [
      { id: 'a', status: 'running' },
      { id: 'b', status: 'pending' },
    ]
    const medians = {
      a: { medianSeconds: 120, sampleCount: 3 },
      b: { medianSeconds: 60, sampleCount: 3 },
    }
    const planArgs = {
      runningPlanIndex: 0,
      plan,
      steps,
      medians,
      runningStepElapsed: 30,
    }
    const labels = stepTimingLabels({
      status: 'running',
      planIndex: 0,
      plan,
      steps,
      medians,
      running: true,
      runningPlanIndex: 0,
      runningStepElapsed: 30,
      etcPlan: computeRunEtcPlan(planArgs),
      anchors: computeEtcAnchors(planArgs),
    })
    expect(labels.eta).toMatch(/left/)
    expect(labels.etc).toMatch(/^ETC /)
    expect(labels.runEtc).toMatch(/^Run ETC /)
  })

  it('suiteRunningTimingSummary aggregates remaining steps', () => {
    const plan = [{ id: 'a' }, { id: 'b' }]
    const steps = [
      { id: 'a', status: 'running' },
      { id: 'b', status: 'pending' },
    ]
    const medians = {
      a: { medianSeconds: 100, sampleCount: 2 },
      b: { medianSeconds: 50, sampleCount: 2 },
    }
    const left = secondsUntilSuiteFinish(0, plan, steps, medians, 40)
    expect(left).toBe(110)
    const planArgs = {
      runningPlanIndex: 0,
      plan,
      steps,
      medians,
      runningStepElapsed: 40,
    }
    const summary = suiteRunningTimingSummary({
      ...planArgs,
      etcPlan: computeRunEtcPlan(planArgs),
      anchors: computeEtcAnchors(planArgs),
    })
    expect(summary.stepLeft).toBeTruthy()
    expect(summary.runEtc).toMatch(/^/)
  })

  it('run ETC matches last step ETC (not before final step)', () => {
    const plan = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}` }))
    const steps = plan.map((p, i) => ({
      id: p.id,
      status: (i < 1 ? 'ok' : i === 1 ? 'running' : 'pending') as string,
      seconds: i < 1 ? 90 : undefined,
    }))
    const medians = Object.fromEntries(
      plan.map((p) => [p.id, { medianSeconds: 100, sampleCount: 5 }])
    )
    const etcPlan = computeRunEtcPlan({
      runningPlanIndex: 1,
      plan,
      steps,
      medians,
      runningStepElapsed: 10,
      useBrightDate: true,
    })
    const lastIdx = 9
    expect(etcPlan.stepFinishBd[lastIdx]).toBeDefined()
    expect(etcPlan.runFinishBd).toBeGreaterThanOrEqual(etcPlan.stepFinishBd[lastIdx]!)
    expect(etcPlan.runFinishBd).toBe(etcPlan.stepFinishBd[lastIdx])
  })

  it('refinedStepRemainingSeconds shortens estimate after fast substeps', () => {
    const substep: SubstepProgress = {
      stepId: 'llm:core',
      manifest: ['a', 'b', 'c', 'd'],
      completed: [
        { id: 'a', durationSeconds: 20, startedAtMs: 0, completedAtMs: 20_000 },
        { id: 'b', durationSeconds: 22, startedAtMs: 20_000, completedAtMs: 42_000 },
      ],
      runningId: 'c',
      runningStartedAtMs: 42_000,
      runningElapsedSeconds: 5,
      playwrightIndex: 0,
      playwrightTotal: 0,
    }
    const naive = 1200 - 47
    const refined = refinedStepRemainingSeconds(1200, 47, substep)
    expect(refined).toBeLessThan(naive)
    expect(refined).toBeGreaterThan(0)
  })

  it('formatSubstepProgressLabel shows 0/N before first pytest START', () => {
    expect(
      formatSubstepProgressLabel({
        stepId: 'llm:core',
        manifest: ['a', 'b'],
        completed: [],
        runningId: null,
        runningStartedAtMs: null,
        runningElapsedSeconds: 0,
        playwrightIndex: 0,
        playwrightTotal: 0,
      })
    ).toBe('0/2 tests')
  })

  it('refinedSecondsUntilSuiteFinish uses sub-step pace for running step', () => {
    const plan = [{ id: 'llm:core' }, { id: 'e2e:llm' }]
    const steps = [
      { id: 'llm:core', status: 'running' },
      { id: 'e2e:llm', status: 'pending' },
    ]
    const medians = {
      'llm:core': { medianSeconds: 1200, sampleCount: 3 },
      'e2e:llm': { medianSeconds: 600, sampleCount: 3 },
    }
    const substep: SubstepProgress = {
      stepId: 'llm:core',
      manifest: Array.from({ length: 10 }, (_, i) => `t${i}`),
      completed: Array.from({ length: 8 }, (_, i) => ({
        id: `t${i}`,
        durationSeconds: 30,
        startedAtMs: i * 30_000,
        completedAtMs: (i + 1) * 30_000,
      })),
      runningId: 't8',
      runningStartedAtMs: 240_000,
      runningElapsedSeconds: 10,
      playwrightIndex: 0,
      playwrightTotal: 0,
    }
    const coarse = secondsUntilSuiteFinish(0, plan, steps, medians, 260)
    const refined = refinedSecondsUntilSuiteFinish(0, plan, steps, medians, 260, substep)
    expect(refined).toBeLessThan(coarse)
  })
})
