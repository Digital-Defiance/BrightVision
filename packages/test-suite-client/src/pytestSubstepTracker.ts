/**
 * Track pytest START/PASSED markers as ordered substeps for within-step ETA refinement.
 */

import { substepsForStep } from './substepManifest'
import { isAggregateTestMarker, parseTestMarkerLine, type TestMarker } from './testProgressParser'

export type SubstepCompletion = {
  id: string
  durationSeconds: number
  startedAtMs: number
  completedAtMs: number
}

export type SubstepProgress = {
  stepId: string
  manifest: readonly string[]
  completed: SubstepCompletion[]
  runningId: string | null
  runningStartedAtMs: number | null
  runningElapsedSeconds: number
  /** Playwright ``[N/total]`` when manifest is spec-file based. */
  playwrightIndex: number
  playwrightTotal: number
}

const PYTEST_NODE_RE = /\.py::/
const DURATION_RE = /\(([\d.]+)s\)\s*$/i
const RUNNING_TESTS_RE = /^Running\s+(\d+)\s+tests/i
const RUST_RUNNING_TESTS_RE = /^running\s+(\d+)\s+tests/i
const PLAYWRIGHT_LIST_INDEX_RE = /^\s*✓\s*(\d+)\s+/
const MS_DURATION_RE = /\(([\d.]+)\s*ms\)\s*$/i
const STRIP_STDERR = /^\[stderr\]\s*/

export function parseMarkerDurationSeconds(raw: string): number | null {
  const m = raw.trim().match(DURATION_RE)
  if (m) {
    const n = Number(m[1])
    return Number.isFinite(n) ? n : null
  }
  const ms = raw.trim().match(MS_DURATION_RE)
  if (ms) {
    const n = Number(ms[1])
    return Number.isFinite(n) ? n / 1000 : null
  }
  return null
}

function normalizeFeedLine(rawLine: string): string {
  return rawLine.replace(STRIP_STDERR, '').trim()
}

export function normalizeSubstepId(label: string): string {
  return label.trim().replace(/\\/g, '/')
}

function isPytestNode(label: string): boolean {
  return PYTEST_NODE_RE.test(label)
}

function manifestEntryForLabel(
  manifest: readonly string[],
  label: string
): string | null {
  const norm = normalizeSubstepId(label)
  for (const entry of manifest) {
    if (norm === entry || norm.startsWith(`${entry}::`) || norm.includes(entry)) {
      return entry
    }
  }
  return null
}

export class PytestSubstepTracker {
  private stepId: string | null = null
  private manifest: readonly string[] = []
  private completed: SubstepCompletion[] = []
  private runningId: string | null = null
  private runningStartedAtMs: number | null = null
  private playwrightIndex = 0
  private playwrightTotal = 0

  resetForStep(stepId: string, opts?: { specGenPhased?: boolean }): void {
    this.stepId = stepId
    this.manifest = substepsForStep(stepId, opts)
    this.completed = []
    this.runningId = null
    this.runningStartedAtMs = null
    this.playwrightIndex = 0
    this.playwrightTotal = 0
  }

  notePlaywrightProgress(index: number, total: number): void {
    if (index > 0 && total > 0) {
      this.playwrightIndex = index
      this.playwrightTotal = total
    }
  }

  private feedDynamic(marker: TestMarker, rawLine: string): void {
    const line = normalizeFeedLine(rawLine)

    if (marker.outcome === 'start') {
      this.runningId = normalizeSubstepId(marker.label)
      this.runningStartedAtMs = Date.now()
      return
    }

    if (marker.outcome !== 'pass') return

    const id = normalizeSubstepId(marker.label)
    const durationSeconds = parseMarkerDurationSeconds(marker.raw) ?? 0
    const completedAtMs = Date.now()
    const startedAtMs =
      this.runningId === id && this.runningStartedAtMs != null
        ? this.runningStartedAtMs
        : completedAtMs - durationSeconds * 1000
    if (!this.completed.some((c) => c.id === id)) {
      this.completed.push({ id, durationSeconds, startedAtMs, completedAtMs })
    }

    const listMatch = line.match(PLAYWRIGHT_LIST_INDEX_RE)
    if (listMatch) {
      const idx = Number(listMatch[1])
      if (idx > 0) {
        this.playwrightIndex = idx
        if (!this.playwrightTotal) this.playwrightTotal = idx
      }
      if (this.playwrightTotal > 0 && idx < this.playwrightTotal) {
        this.runningId = `test ${idx + 1}/${this.playwrightTotal}`
        this.runningStartedAtMs = Date.now()
      } else {
        this.runningId = null
        this.runningStartedAtMs = null
      }
      return
    }

    this.runningId = null
    this.runningStartedAtMs = null
  }

  feed(rawLine: string): void {
    const line = normalizeFeedLine(rawLine)
    if (this.manifest.length === 0) {
      const runningTests = line.match(RUNNING_TESTS_RE) ?? line.match(RUST_RUNNING_TESTS_RE)
      if (runningTests) {
        this.playwrightTotal = Number(runningTests[1])
        if (!this.runningId) {
          this.runningId = `1/${this.playwrightTotal}`
          this.runningStartedAtMs = Date.now()
        }
        return
      }
      const marker = parseTestMarkerLine(rawLine)
      if (!marker || isAggregateTestMarker(marker)) return
      this.feedDynamic(marker, rawLine)
      return
    }

    const marker = parseTestMarkerLine(rawLine)
    if (!marker) return

    if (marker.outcome === 'start' && isPytestNode(marker.label)) {
      const id = manifestEntryForLabel(this.manifest, marker.label) ?? normalizeSubstepId(marker.label)
      this.runningId = id
      this.runningStartedAtMs = Date.now()
      return
    }

    if (marker.outcome === 'pass' && isPytestNode(marker.label)) {
      const id = manifestEntryForLabel(this.manifest, marker.label) ?? normalizeSubstepId(marker.label)
      const durationSeconds = parseMarkerDurationSeconds(marker.raw) ?? 0
      const completedAtMs = Date.now()
      const startedAtMs =
        this.runningId === id && this.runningStartedAtMs != null
          ? this.runningStartedAtMs
          : completedAtMs - durationSeconds * 1000
      if (!this.completed.some((c) => c.id === id)) {
        this.completed.push({ id, durationSeconds, startedAtMs, completedAtMs })
      }
      if (this.runningId === id) {
        this.runningId = null
        this.runningStartedAtMs = null
      }
    }
  }

  snapshot(
    nowMs = Date.now(),
    serverStepElapsedSeconds?: number | null
  ): SubstepProgress | null {
    if (!this.stepId) return null
    const hasDynamicProgress =
      this.manifest.length === 0 &&
      (this.completed.length > 0 ||
        this.runningId != null ||
        this.playwrightIndex > 0 ||
        this.playwrightTotal > 0)
    if (this.manifest.length === 0 && !hasDynamicProgress) return null
    let runningElapsedSeconds = 0
    if (this.runningId != null) {
      if (serverStepElapsedSeconds != null && serverStepElapsedSeconds >= 0) {
        const doneDur = this.completed.reduce((s, c) => s + c.durationSeconds, 0)
        runningElapsedSeconds = Math.max(0, serverStepElapsedSeconds - doneDur)
      } else if (this.runningStartedAtMs != null) {
        runningElapsedSeconds = Math.max(0, (nowMs - this.runningStartedAtMs) / 1000)
      }
    }
    return {
      stepId: this.stepId,
      manifest: this.manifest,
      completed: [...this.completed],
      runningId: this.runningId,
      runningStartedAtMs: this.runningStartedAtMs,
      runningElapsedSeconds,
      playwrightIndex: this.playwrightIndex,
      playwrightTotal: this.playwrightTotal,
    }
  }
}
