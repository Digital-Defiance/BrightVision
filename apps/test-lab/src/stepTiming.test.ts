import { describe, expect, it } from 'vitest'
import {
  computeEtcAnchors,
  computeRunEtcPlan,
  formatEtcClock,
  secondsUntilSuiteFinish,
  stepTimingLabels,
  suiteRunningTimingSummary,
} from './stepTiming'

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
})
