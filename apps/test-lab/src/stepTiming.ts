import { fmtDuration } from './testSuiteClient'

export type StepMedian = { medianSeconds: number; sampleCount: number }

export function formatEtcClock(secondsFromNow: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(Date.now() + secondsFromNow * 1000))
}

/** Seconds from now until step at planIndex would typically start. */
export function secondsUntilStepStart(
  planIndex: number,
  plan: Array<{ id: string }>,
  steps: Array<{ id: string; status: string; seconds?: number }>,
  medians: Record<string, StepMedian>,
  runningPlanIndex = -1,
  runningStepElapsed = 0
): number {
  let offset = 0
  for (let i = 0; i < planIndex; i++) {
    const id = plan[i]?.id
    const step = steps[i]
    const med = medians[id]?.medianSeconds ?? 0
    if (!step) {
      offset += med
      continue
    }
    if (step.status === 'ok' || step.status === 'fail') {
      offset += step.seconds ?? med
    } else if (step.status === 'running') {
      const elapsed = i === runningPlanIndex ? runningStepElapsed : 0
      offset += Math.max(0, med - elapsed)
    } else {
      offset += med
    }
  }
  return offset
}

export function stepTimingLabels(opts: {
  status: 'pending' | 'running' | 'ok' | 'fail'
  planIndex: number
  plan: Array<{ id: string }>
  steps: Array<{ id: string; status: string; seconds?: number }>
  medians: Record<string, StepMedian>
  running: boolean
  runningPlanIndex?: number
  runningStepElapsed?: number
}): { eta?: string; etc?: string } {
  const id = opts.plan[opts.planIndex]?.id
  const timing = id ? opts.medians[id] : undefined
  const median = timing?.medianSeconds ?? 0
  const hasHistory = (timing?.sampleCount ?? 0) > 0

  if (opts.status === 'pending') {
    if (!hasHistory || median <= 0) return {}
    const eta = `ETA ~${fmtDuration(median)}`
    if (opts.running) {
      const until = secondsUntilStepStart(
        opts.planIndex,
        opts.plan,
        opts.steps,
        opts.medians,
        opts.runningPlanIndex ?? -1,
        opts.runningStepElapsed ?? 0
      )
      return { eta, etc: `ETC ${formatEtcClock(until)}` }
    }
    return { eta }
  }

  if (
    opts.status === 'running' &&
    opts.planIndex === opts.runningPlanIndex &&
    hasHistory &&
    median > 0
  ) {
    const left = Math.max(0, median - (opts.runningStepElapsed ?? 0))
    if (left > 5) return { eta: `~${fmtDuration(left)} left` }
  }

  return {}
}
