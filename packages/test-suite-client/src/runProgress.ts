import { PytestSubstepTracker, type SubstepProgress } from './pytestSubstepTracker'
import { parseTestMarkerLine, PlaywrightLineTracker } from './testProgressParser'
import type { RunStepState, SuiteStepPlan, TestSuiteEvent } from './types'

export type RunProgressSnapshot = {
  steps: RunStepState[]
  progress: { index: number; total: number; elapsed: number; stepElapsed: number }
  substep: SubstepProgress | null
  running: boolean
  runOk: boolean | null
  error: string | null
  currentStepId: string | null
}

export class RunProgressTracker {
  private pytest = new PytestSubstepTracker()
  private playwright = new PlaywrightLineTracker()
  private specGenPhased = false
  private plan: SuiteStepPlan[] = []
  private steps: RunStepState[] = []
  private progress = { index: 0, total: 0, elapsed: 0, stepElapsed: 0 }
  private substep: SubstepProgress | null = null
  private running = false
  private runOk: boolean | null = null
  private error: string | null = null
  private currentStepId: string | null = null
  /** Server-reported step elapsed, extrapolated between progress heartbeats. */
  private stepElapsedAnchor: { seconds: number; atMs: number } | null = null
  /** Server-reported suite elapsed, extrapolated between progress heartbeats. */
  private elapsedAnchor: { seconds: number; atMs: number } | null = null

  initPlan(plan: SuiteStepPlan[]): void {
    this.plan = plan
    this.steps = plan.map((p) => ({ id: p.id, label: p.label, status: 'pending' }))
    this.progress = { index: 0, total: plan.length, elapsed: 0, stepElapsed: 0 }
    this.substep = null
    this.running = false
    this.runOk = null
    this.error = null
    this.currentStepId = null
    this.stepElapsedAnchor = null
    this.elapsedAnchor = null
  }

  private noteProgressTiming(
    elapsedSeconds?: number,
    stepElapsedSeconds?: number,
    atMs = Date.now()
  ): void {
    if (elapsedSeconds != null) {
      this.elapsedAnchor = { seconds: elapsedSeconds, atMs }
    }
    if (stepElapsedSeconds != null) {
      this.stepElapsedAnchor = { seconds: stepElapsedSeconds, atMs }
    }
  }

  private extrapolatedElapsed(nowMs = Date.now()): number {
    if (this.elapsedAnchor) {
      return (
        this.elapsedAnchor.seconds +
        Math.max(0, (nowMs - this.elapsedAnchor.atMs) / 1000)
      )
    }
    return this.progress.elapsed
  }

  private extrapolatedStepElapsed(nowMs = Date.now()): number | null {
    if (this.stepElapsedAnchor) {
      return (
        this.stepElapsedAnchor.seconds +
        Math.max(0, (nowMs - this.stepElapsedAnchor.atMs) / 1000)
      )
    }
    return this.progress.stepElapsed > 0 ? this.progress.stepElapsed : null
  }

  private refreshSubstep(nowMs = Date.now()): void {
    this.substep = this.pytest.snapshot(nowMs, this.extrapolatedStepElapsed(nowMs))
  }

  setSpecGenPhased(on: boolean): void {
    this.specGenPhased = on
  }

  /** Replay stored events (e.g. after reconnect). */
  replay(events: TestSuiteEvent[]): void {
    for (const ev of events) this.apply(ev)
  }

  apply(ev: TestSuiteEvent): void {
    if (ev.type === 'run_started') {
      this.running = true
      this.runOk = null
      this.elapsedAnchor = { seconds: 0, atMs: Date.now() }
    }
    if (ev.type === 'progress') {
      const newIndex = ev.stepIndex || this.progress.index
      const stepIndexAdvanced =
        ev.stepIndex != null && ev.stepIndex > 0 && ev.stepIndex !== this.progress.index
      this.noteProgressTiming(ev.elapsedSeconds, ev.stepElapsedSeconds)
      this.progress = {
        index: newIndex,
        total: ev.totalSteps || this.progress.total,
        elapsed: Math.max(this.progress.elapsed, ev.elapsedSeconds || 0),
        stepElapsed:
          ev.stepElapsedSeconds ?? (stepIndexAdvanced ? 0 : this.progress.stepElapsed),
      }
    }
    if (ev.type === 'step_started' && ev.stepId) {
      this.playwright.reset()
      this.pytest.resetForStep(ev.stepId, { specGenPhased: this.specGenPhased })
      this.currentStepId = ev.stepId
      const idx = this.plan.findIndex((s) => s.id === ev.stepId)
      const atMs = Date.now()
      this.stepElapsedAnchor = { seconds: 0, atMs }
      this.progress = {
        ...this.progress,
        stepElapsed: 0,
        index: idx >= 0 ? idx + 1 : this.progress.index,
      }
      this.refreshSubstep(atMs)
      this.steps = this.steps.map((s) =>
        s.id === ev.stepId ? { ...s, status: 'running' } : s
      )
    }
    if (ev.type === 'step_skipped' && ev.stepId) {
      this.steps = this.steps.map((s) =>
        s.id === ev.stepId ? { ...s, status: 'skipped' } : s
      )
    }
    if (ev.type === 'step_line' && ev.stepId && ev.line) {
      const trackerMarkers = this.playwright.feed(ev.line)
      const pw = this.playwright.progress()
      if (pw) this.pytest.notePlaywrightProgress(pw.index, pw.total)
      if (trackerMarkers.length === 0) {
        const marker = parseTestMarkerLine(ev.line)
        if (marker) {
          /* marker-only lines still update pytest via feed below */
        }
      }
      this.pytest.feed(ev.line)
      this.refreshSubstep()
    }
    if (ev.type === 'step_finished' && ev.stepId) {
      this.substep = null
      this.stepElapsedAnchor = null
      if (ev.seconds != null) {
        this.progress = { ...this.progress, stepElapsed: ev.seconds }
      }
      this.steps = this.steps.map((s) =>
        s.id === ev.stepId
          ? {
              ...s,
              status: ev.ok && !ev.cancelled ? 'ok' : 'fail',
              seconds: ev.seconds,
            }
          : s
      )
      if (this.currentStepId === ev.stepId) this.currentStepId = null
    }
    if (ev.type === 'run_finished') {
      const finishedOk = !!ev.ok && !ev.cancelled
      this.runOk = finishedOk
      this.running = false
      const skipped = new Set(ev.skippedStepIds ?? [])
      if (skipped.size > 0) {
        this.steps = this.steps.map((s) =>
          skipped.has(s.id) && s.status === 'pending' ? { ...s, status: 'skipped' } : s
        )
      }
      if (ev.elapsedSeconds != null) {
        this.noteProgressTiming(ev.elapsedSeconds)
        this.progress = { ...this.progress, elapsed: ev.elapsedSeconds }
      }
    }
    if (ev.type === 'error' && ev.text) {
      this.error = ev.text
    }
  }

  snapshot(nowMs = Date.now()): RunProgressSnapshot {
    this.refreshSubstep(nowMs)
    const stepElapsed = this.extrapolatedStepElapsed(nowMs) ?? this.progress.stepElapsed
    return {
      steps: [...this.steps],
      progress: {
        ...this.progress,
        elapsed: this.extrapolatedElapsed(nowMs),
        stepElapsed,
      },
      substep: this.substep ? { ...this.substep, completed: [...this.substep.completed] } : null,
      running: this.running,
      runOk: this.runOk,
      error: this.error,
      currentStepId: this.currentStepId,
    }
  }
}
