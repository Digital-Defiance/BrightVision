import { describe, expect, it } from 'vitest'
import {
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
    const labels = stepTimingLabels({
      status: 'running',
      planIndex: 0,
      plan,
      steps,
      medians,
      running: true,
      runningPlanIndex: 0,
      runningStepElapsed: 30,
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
    expect(left).toBeGreaterThan(90)
    const summary = suiteRunningTimingSummary({
      runningPlanIndex: 0,
      plan,
      steps,
      medians,
      runningStepElapsed: 40,
    })
    expect(summary.stepLeft).toBeTruthy()
    expect(summary.runEtc).toMatch(/^/)
  })
})
