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

function stepMedianLeft(
  planIndex: number,
  plan: Array<{ id: string }>,
  medians: Record<string, StepMedian>,
  stepElapsed: number
): number {
  const id = plan[planIndex]?.id
  const median = id ? medians[id]?.medianSeconds ?? 0 : 0
  if (median <= 0) return 0
  return Math.max(0, median - stepElapsed)
}

/** Seconds until suite finish from the start of the current running step. */
export function secondsUntilSuiteFinish(
  runningPlanIndex: number,
  plan: Array<{ id: string }>,
  steps: Array<{ id: string; status: string; seconds?: number }>,
  medians: Record<string, StepMedian>,
  runningStepElapsed: number
): number {
  if (runningPlanIndex < 0) return 0
  let total = stepMedianLeft(runningPlanIndex, plan, medians, runningStepElapsed)
  total += secondsUntilStepStart(
    runningPlanIndex + 1,
    plan,
    steps,
    medians,
    runningPlanIndex,
    runningStepElapsed
  )
  return total
}

/** Header timing while a step is running. */
export function suiteRunningTimingSummary(opts: {
  runningPlanIndex: number
  plan: Array<{ id: string }>
  steps: Array<{ id: string; status: string; seconds?: number }>
  medians: Record<string, StepMedian>
  runningStepElapsed: number
}): {
  stepLeft?: string
  stepEtc?: string
  runEtc?: string
  runLeft?: string
} {
  const idx = opts.runningPlanIndex
  if (idx < 0) return {}
  const left = stepMedianLeft(idx, opts.plan, opts.medians, opts.runningStepElapsed)
  const suiteLeft = secondsUntilSuiteFinish(
    idx,
    opts.plan,
    opts.steps,
    opts.medians,
    opts.runningStepElapsed
  )
  const out: {
    stepLeft?: string
    stepEtc?: string
    runEtc?: string
    runLeft?: string
  } = {}
  if (left > 0) {
    out.stepLeft = fmtDuration(left)
    out.stepEtc = formatEtcClock(left)
  } else if (opts.runningStepElapsed > 0) {
    out.stepLeft = 'over median'
  }
  if (suiteLeft > 0) {
    out.runLeft = fmtDuration(suiteLeft)
    out.runEtc = formatEtcClock(suiteLeft)
  }
  return out
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
}): { eta?: string; etc?: string; runEtc?: string } {
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

  if (opts.status === 'running' && opts.planIndex === opts.runningPlanIndex) {
    const elapsed = opts.runningStepElapsed ?? 0
    const left = hasHistory && median > 0 ? Math.max(0, median - elapsed) : 0
    const suiteLeft =
      opts.runningPlanIndex != null && opts.runningPlanIndex >= 0
        ? secondsUntilSuiteFinish(
            opts.runningPlanIndex,
            opts.plan,
            opts.steps,
            opts.medians,
            elapsed
          )
        : 0
    const eta =
      left > 0
        ? `~${fmtDuration(left)} left`
        : elapsed > 0 && hasHistory
          ? 'over median'
          : undefined
    const etc =
      left > 0
        ? `ETC ${formatEtcClock(left)}`
        : elapsed > 0 && hasHistory
          ? 'ETC —'
          : undefined
    const runEtc =
      suiteLeft > 0 ? `Run ETC ${formatEtcClock(suiteLeft)}` : undefined
    return { eta, etc, runEtc }
  }

  return {}
}
