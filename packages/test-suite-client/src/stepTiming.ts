import { fmtDuration } from './duration'
import type { SubstepProgress } from './pytestSubstepTracker'
import {
  bdAddSeconds,
  bdFromUnixMs,
  formatDurationBrightDate as fmtDurationBrightDate,
  formatBdScalar,
  formatEtcBrightDate,
} from '@brightvision/vision-client/brightdateTiming'

export type StepMedian = {
  medianSeconds: number
  sampleCount: number
  medianGpuPeak?: number
  medianGpuAvg?: number
  gpuSampleCount?: number
}

export type TimingDisplayOptions = {
  useBrightDate?: boolean
}

/** Blend observed sub-step pace with step median for within-step ETA. */
export function refinedStepRemainingSeconds(
  stepMedian: number,
  stepElapsed: number,
  substep: SubstepProgress | null | undefined
): number {
  const medianLeft = stepMedian > 0 ? Math.max(0, stepMedian - stepElapsed) : 0
  if (!substep) return medianLeft

  const total = substep.manifest.length
  const done = substep.completed.length
  const dynamicPlaywright =
    substep.playwrightTotal > 0 &&
    substep.playwrightIndex > 0 &&
    (total === 0 || !substep.manifest[0]?.includes('.py::'))

  if (dynamicPlaywright) {
    const pace = stepElapsed / substep.playwrightIndex
    const specsLeft = substep.playwrightTotal - substep.playwrightIndex + 1
    const paceLeft = Math.max(0, pace * specsLeft)
    if (done === 0 && stepMedian <= 0) return paceLeft
    const pwWeight = Math.min(0.9, 0.5 + substep.playwrightIndex / substep.playwrightTotal / 2)
    return pwWeight * paceLeft + (1 - pwWeight) * medianLeft
  }

  if (total === 0) return medianLeft

  if (done === 0) return medianLeft

  const completedDur = substep.completed.reduce((s, c) => s + c.durationSeconds, 0)
  const avg = completedDur / done
  const remainingSlots = Math.max(0, total - done)
  let paceLeft = avg * remainingSlots
  if (substep.runningId && remainingSlots > 0) {
    const currentLeft = Math.max(0, avg - substep.runningElapsedSeconds)
    paceLeft = currentLeft + avg * (remainingSlots - 1)
  }

  const paceWeight = Math.min(0.9, 0.35 + (done / total) * 0.55)
  return paceWeight * paceLeft + (1 - paceWeight) * medianLeft
}

export function substepProgressFraction(substep: SubstepProgress | null | undefined): number | null {
  if (!substep) return null
  const manifestTotal = substep.manifest.length
  const dynamicPlaywright =
    substep.playwrightTotal > 0 &&
    substep.playwrightIndex > 0 &&
    (manifestTotal === 0 || !substep.manifest[0]?.includes('.py::'))
  if (dynamicPlaywright) {
    return Math.min(1, substep.playwrightIndex / substep.playwrightTotal)
  }
  if (manifestTotal === 0) return null
  const done = substep.completed.length
  const total = manifestTotal
  if (substep.runningId) {
    return Math.min(1, (done + 0.35) / total)
  }
  return Math.min(1, done / total)
}

export function formatSubstepProgressLabel(substep: SubstepProgress | null | undefined): string | null {
  if (!substep) return null
  const manifestTotal = substep.manifest.length
  if (substep.playwrightTotal > 0 && substep.playwrightIndex > 0) {
    const unit =
      manifestTotal > 0 && !substep.manifest[0]?.includes('.py::') ? 'specs' : 'tests'
    return `${substep.playwrightIndex}/${substep.playwrightTotal} ${unit}`
  }
  if (manifestTotal === 0) {
    if (substep.completed.length > 0) {
      return `${substep.completed.length} passed`
    }
    return null
  }
  const done = substep.completed.length
  const total = manifestTotal
  const at = substep.runningId ? done + 1 : done
  return `${Math.min(at, total)}/${total} tests`
}

/** Seconds until suite finish using refined within-step estimate when available. */
export function refinedSecondsUntilSuiteFinish(
  runningPlanIndex: number,
  plan: Array<{ id: string }>,
  steps: Array<{ id: string; status: string; seconds?: number }>,
  medians: Record<string, StepMedian>,
  runningStepElapsed: number,
  substep: SubstepProgress | null | undefined
): number {
  if (runningPlanIndex < 0) return 0
  const lastIdx = lastNonSkippedPlanIndex(plan, steps)
  if (lastIdx < runningPlanIndex) return 0

  let remaining = 0
  for (let i = runningPlanIndex; i <= lastIdx; i++) {
    const st = steps[i]
    if (st?.status === 'skipped') continue
    const id = plan[i]?.id
    const median = id ? medians[id]?.medianSeconds ?? 0 : 0
    if (i === runningPlanIndex) {
      remaining += refinedStepRemainingSeconds(median, runningStepElapsed, substep)
    } else if (st?.status === 'pending' || st?.status === 'running') {
      remaining += median
    }
  }
  return remaining
}

export type EtcAnchors = {
  stepEtcWallMs: number | null
  runEtcWallMs: number | null
  stepEtcBd: number | null
  runEtcBd: number | null
}

/** Fixed finish times for every not-yet-finished step (set once when a step starts). */
export type RunEtcPlan = {
  /** planIndex → fixed finish instant */
  stepFinishWallMs: Record<number, number>
  stepFinishBd: Record<number, number>
  runFinishWallMs: number | null
  runFinishBd: number | null
}

function fmtStepDuration(sec: number, opts?: TimingDisplayOptions): string {
  return opts?.useBrightDate ? fmtDurationBrightDate(sec) : fmtDuration(sec)
}

export function formatEtcClock(
  secondsFromNow: number,
  opts?: TimingDisplayOptions
): string {
  if (opts?.useBrightDate) return formatEtcBrightDate(secondsFromNow)
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(Date.now() + secondsFromNow * 1000))
}

export function formatAnchoredEtc(
  anchors: EtcAnchors,
  kind: 'step' | 'run',
  useBrightDate: boolean
): string | null {
  if (useBrightDate) {
    const bd = kind === 'step' ? anchors.stepEtcBd : anchors.runEtcBd
    if (bd != null) return formatBdScalar(bd)
    return null
  }
  const wall = kind === 'step' ? anchors.stepEtcWallMs : anchors.runEtcWallMs
  if (wall == null) return null
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(wall))
}

/** Fixed ETC anchors at step start — avoids upticking while the clock runs. */
export function computeEtcAnchors(opts: {
  runningPlanIndex: number
  plan: Array<{ id: string }>
  steps: Array<{ id: string; status: string; seconds?: number }>
  medians: Record<string, StepMedian>
  runningStepElapsed: number
  useBrightDate?: boolean
}): EtcAnchors {
  const idx = opts.runningPlanIndex
  if (idx < 0) {
    return { stepEtcWallMs: null, runEtcWallMs: null, stepEtcBd: null, runEtcBd: null }
  }
  const id = opts.plan[idx]?.id
  const median = id ? opts.medians[id]?.medianSeconds ?? 0 : 0
  const stepLeft = median > 0 ? Math.max(0, median - opts.runningStepElapsed) : 0
  const suiteLeft = secondsUntilSuiteFinish(
    idx,
    opts.plan,
    opts.steps,
    opts.medians,
    opts.runningStepElapsed
  )
  const nowMs = Date.now()
  const nowBd = opts.useBrightDate ? bdFromUnixMs(nowMs) : null
  return {
    stepEtcWallMs: stepLeft > 0 ? nowMs + stepLeft * 1000 : null,
    runEtcWallMs: suiteLeft > 0 ? nowMs + suiteLeft * 1000 : null,
    stepEtcBd: stepLeft > 0 && nowBd != null ? bdAddSeconds(nowBd, stepLeft) : null,
    runEtcBd: suiteLeft > 0 && nowBd != null ? bdAddSeconds(nowBd, suiteLeft) : null,
  }
}

/** Snapshot finish times for current + all later steps (stable for the whole step run). */
export function computeRunEtcPlan(opts: {
  runningPlanIndex: number
  plan: Array<{ id: string }>
  steps: Array<{ id: string; status: string; seconds?: number }>
  medians: Record<string, StepMedian>
  runningStepElapsed: number
  useBrightDate?: boolean
}): RunEtcPlan {
  const idx = opts.runningPlanIndex
  const nowMs = Date.now()
  const nowBd = opts.useBrightDate ? bdFromUnixMs(nowMs) : null
  const stepFinishWallMs: Record<number, number> = {}
  const stepFinishBd: Record<number, number> = {}

  if (idx < 0) {
    return { stepFinishWallMs, stepFinishBd, runFinishWallMs: null, runFinishBd: null }
  }

  for (let i = idx; i < opts.plan.length; i++) {
    const st = opts.steps[i]
    if (st?.status === 'skipped') continue
    const id = opts.plan[i]?.id
    const median = id ? opts.medians[id]?.medianSeconds ?? 0 : 0
    const untilStart = secondsUntilStepStart(
      i,
      opts.plan,
      opts.steps,
      opts.medians,
      idx,
      opts.runningStepElapsed
    )
    const finishSec = untilStart + (median > 0 ? median : 0)
    if (finishSec > 0) {
      stepFinishWallMs[i] = nowMs + finishSec * 1000
      if (nowBd != null) stepFinishBd[i] = bdAddSeconds(nowBd, finishSec)
    }
  }

  const suiteLeft = secondsUntilSuiteFinish(
    idx,
    opts.plan,
    opts.steps,
    opts.medians,
    opts.runningStepElapsed
  )
  let runFinishWallMs = suiteLeft > 0 ? nowMs + suiteLeft * 1000 : null
  let runFinishBd = suiteLeft > 0 && nowBd != null ? bdAddSeconds(nowBd, suiteLeft) : null
  for (const wall of Object.values(stepFinishWallMs)) {
    if (runFinishWallMs == null || wall > runFinishWallMs) runFinishWallMs = wall
  }
  for (const bd of Object.values(stepFinishBd)) {
    if (runFinishBd == null || bd > runFinishBd) runFinishBd = bd
  }
  return {
    stepFinishWallMs,
    stepFinishBd,
    runFinishWallMs,
    runFinishBd,
  }
}

export function formatPlannedStepEtc(
  plan: RunEtcPlan | null | undefined,
  planIndex: number,
  useBrightDate: boolean
): string | null {
  if (!plan) return null
  if (useBrightDate) {
    const bd = plan.stepFinishBd[planIndex]
    return bd != null ? formatBdScalar(bd) : null
  }
  const wall = plan.stepFinishWallMs[planIndex]
  if (wall == null) return null
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(wall))
}

export function formatPlannedRunEtc(
  plan: RunEtcPlan | null | undefined,
  useBrightDate: boolean
): string | null {
  if (!plan) return null
  if (useBrightDate) {
    return plan.runFinishBd != null ? formatBdScalar(plan.runFinishBd) : null
  }
  if (plan.runFinishWallMs == null) return null
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(plan.runFinishWallMs))
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

/** Last plan row that is not skipped (suite finish is when this step completes). */
function lastNonSkippedPlanIndex(
  plan: Array<{ id: string }>,
  steps: Array<{ id: string; status: string }>
): number {
  for (let i = plan.length - 1; i >= 0; i--) {
    if (steps[i]?.status !== 'skipped') return i
  }
  return -1
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
  const lastIdx = lastNonSkippedPlanIndex(plan, steps)
  if (lastIdx < runningPlanIndex) return 0
  const untilStart = secondsUntilStepStart(
    lastIdx,
    plan,
    steps,
    medians,
    runningPlanIndex,
    runningStepElapsed
  )
  const id = plan[lastIdx]?.id
  const median = id ? medians[id]?.medianSeconds ?? 0 : 0
  return untilStart + Math.max(0, median)
}

/** Header timing while a step is running (uses fixed ETC anchors when provided). */
export function suiteRunningTimingSummary(opts: {
  runningPlanIndex: number
  plan: Array<{ id: string }>
  steps: Array<{ id: string; status: string; seconds?: number }>
  medians: Record<string, StepMedian>
  runningStepElapsed: number
  useBrightDate?: boolean
  anchors?: EtcAnchors | null
  etcPlan?: RunEtcPlan | null
  substep?: SubstepProgress | null
}): {
  stepLeft?: string
  stepEtc?: string
  runEtc?: string
  runLeft?: string
  substepLabel?: string
} {
  const display: TimingDisplayOptions = { useBrightDate: opts.useBrightDate }
  const idx = opts.runningPlanIndex
  if (idx < 0) return {}
  const stepId = opts.plan[idx]?.id
  const stepMedian = stepId ? opts.medians[stepId]?.medianSeconds ?? 0 : 0
  const refinedLeft = refinedStepRemainingSeconds(
    stepMedian,
    opts.runningStepElapsed,
    opts.substep
  )
  const left =
    opts.substep && opts.substep.manifest.length > 0
      ? refinedLeft
      : stepMedianLeft(idx, opts.plan, opts.medians, opts.runningStepElapsed)
  const suiteLeft =
    opts.substep && opts.substep.manifest.length > 0
      ? refinedSecondsUntilSuiteFinish(
          idx,
          opts.plan,
          opts.steps,
          opts.medians,
          opts.runningStepElapsed,
          opts.substep
        )
      : secondsUntilSuiteFinish(
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
    substepLabel?: string
  } = {}
  const substepLabel = formatSubstepProgressLabel(opts.substep)
  if (substepLabel) out.substepLabel = substepLabel
  if (left > 0) {
    out.stepLeft = fmtStepDuration(left, display)
    if (opts.substep && opts.substep.manifest.length > 0) {
      out.stepEtc = `ETC ${formatEtcClock(left, display)}`
    } else if (opts.anchors) {
      out.stepEtc =
        formatAnchoredEtc(opts.anchors, 'step', !!opts.useBrightDate) ?? undefined
    }
  } else if (opts.runningStepElapsed > 0) {
    out.stepLeft = 'over median'
  }
  if (suiteLeft > 0) {
    out.runLeft = fmtStepDuration(suiteLeft, display)
    const runEtc =
      opts.substep && opts.substep.manifest.length > 0
        ? `Run ETC ${formatEtcClock(suiteLeft, display)}`
        : formatPlannedRunEtc(opts.etcPlan, !!opts.useBrightDate) ??
          (opts.anchors
            ? formatAnchoredEtc(opts.anchors, 'run', !!opts.useBrightDate) ?? undefined
            : undefined)
    if (runEtc) out.runEtc = runEtc
  }
  return out
}

export function suiteProgressPercent(opts: {
  plan: Array<{ id: string }>
  steps: Array<{ id: string; status: string; seconds?: number }>
  medians: Record<string, StepMedian>
  stepElapsed: number
  etaTotal: number
  substep?: SubstepProgress | null
}): number {
  if (opts.etaTotal <= 0) return 0
  let done = 0
  for (let i = 0; i < opts.plan.length; i++) {
    const st = opts.steps[i]
    const med = opts.medians[opts.plan[i]?.id]?.medianSeconds ?? 0
    if (st?.status === 'ok' || st?.status === 'fail') {
      done += st.seconds ?? med
    } else if (st?.status === 'running') {
      const frac = substepProgressFraction(opts.substep)
      if (frac != null && med > 0) {
        done += med * frac
      } else {
        done += opts.stepElapsed
      }
      break
    } else if (st?.status === 'skipped') {
      continue
    } else {
      break
    }
  }
  return Math.min(99, Math.round((done / opts.etaTotal) * 100))
}

export function stepTimingLabels(opts: {
  status: 'pending' | 'running' | 'ok' | 'fail' | 'skipped'
  planIndex: number
  plan: Array<{ id: string }>
  steps: Array<{ id: string; status: string; seconds?: number }>
  medians: Record<string, StepMedian>
  running: boolean
  runningPlanIndex?: number
  runningStepElapsed?: number
  useBrightDate?: boolean
  anchors?: EtcAnchors | null
  etcPlan?: RunEtcPlan | null
  substep?: SubstepProgress | null
}): { eta?: string; etc?: string; runEtc?: string; substepLabel?: string } {
  const display: TimingDisplayOptions = { useBrightDate: opts.useBrightDate }
  const id = opts.plan[opts.planIndex]?.id
  const timing = id ? opts.medians[id] : undefined
  const median = timing?.medianSeconds ?? 0
  const hasHistory = (timing?.sampleCount ?? 0) > 0

  if (opts.status === 'pending') {
    if (!hasHistory || median <= 0) return {}
    const eta = `ETA ~${fmtStepDuration(median, display)}`
    if (opts.running) {
      const planned = formatPlannedStepEtc(opts.etcPlan, opts.planIndex, !!opts.useBrightDate)
      return planned ? { eta, etc: `ETC ${planned}` } : { eta }
    }
    return { eta }
  }

  if (opts.status === 'running' && opts.planIndex === opts.runningPlanIndex) {
    const elapsed = opts.runningStepElapsed ?? 0
    const refinedLeft = refinedStepRemainingSeconds(median, elapsed, opts.substep)
    const left =
      opts.substep && opts.substep.manifest.length > 0
        ? refinedLeft
        : hasHistory && median > 0
          ? Math.max(0, median - elapsed)
          : 0
    const suiteLeft =
      opts.runningPlanIndex != null && opts.runningPlanIndex >= 0
        ? opts.substep && opts.substep.manifest.length > 0
          ? refinedSecondsUntilSuiteFinish(
              opts.runningPlanIndex,
              opts.plan,
              opts.steps,
              opts.medians,
              elapsed,
              opts.substep
            )
          : secondsUntilSuiteFinish(
              opts.runningPlanIndex,
              opts.plan,
              opts.steps,
              opts.medians,
              elapsed
            )
        : 0
    const eta =
      left > 0
        ? `~${fmtStepDuration(left, display)} left`
        : elapsed > 0 && hasHistory
          ? 'over median'
          : undefined
    const plannedStep = formatPlannedStepEtc(
      opts.etcPlan,
      opts.planIndex,
      !!opts.useBrightDate
    )
    const etc =
      opts.substep && opts.substep.manifest.length > 0 && left > 0
        ? `ETC ${formatEtcClock(left, display)}`
        : plannedStep != null
          ? `ETC ${plannedStep}`
          : left > 0 && opts.anchors
            ? `ETC ${
                formatAnchoredEtc(opts.anchors, 'step', !!opts.useBrightDate) ?? '—'
              }`
            : elapsed > 0 && hasHistory
              ? 'ETC —'
              : undefined
    const plannedRun = formatPlannedRunEtc(opts.etcPlan, !!opts.useBrightDate)
    const runEtc =
      opts.substep && opts.substep.manifest.length > 0 && suiteLeft > 0
        ? `Run ETC ${formatEtcClock(suiteLeft, display)}`
        : plannedRun != null
          ? `Run ETC ${plannedRun}`
          : suiteLeft > 0 && opts.anchors
            ? `Run ETC ${
                formatAnchoredEtc(opts.anchors, 'run', !!opts.useBrightDate) ?? '—'
              }`
            : undefined
    const substepLabel = formatSubstepProgressLabel(opts.substep) ?? undefined
    return { eta, etc, runEtc, substepLabel }
  }

  return {}
}

/** Re-export for step chips when BrightDate mode is on. */
export {
  formatDurationBrightDate as fmtDurationBrightDate,
  formatBdBounds,
} from '@brightvision/vision-client/brightdateTiming'
