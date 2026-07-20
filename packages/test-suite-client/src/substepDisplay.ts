/**
 * Format sub-step progress for Test Lab UI (last done + current running).
 */

import { bdFromUnixMs, formatBdScalar } from '@brightvision/vision-client/brightdateTiming'
import { fmtDuration } from './duration'
import type { SubstepProgress } from './pytestSubstepTracker'
import { formatSubstepProgressLabel } from './stepTiming'

export function shortSubstepLabel(id: string): string {
  const norm = id.replace(/\\/g, '/')
  const py = norm.match(/([^/]+\.py)(?:::(.+))?$/)
  if (py) {
    const file = py[1].replace(/\.py$/, '')
    const test = py[2] ? `::${py[2].split('::').pop() ?? py[2]}` : ''
    return `${file}${test}`
  }
  const base = norm.split('/').pop() ?? norm
  return base.replace(/\.spec\.ts$/, '')
}

function formatInstant(ms: number, useBrightDate: boolean): string {
  if (useBrightDate) {
    return formatBdScalar(bdFromUnixMs(ms), 4)
  }
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export type SubstepDisplayLines = {
  lastDone?: { label: string; endedAt: string }
  running?: {
    label: string
    startedAt: string
    progress: string
    elapsed: string
  }
}

export function substepDisplayLines(
  substep: SubstepProgress | null | undefined,
  useBrightDate: boolean,
  nowMs = Date.now()
): SubstepDisplayLines | null {
  if (!substep) return null
  const hasProgress =
    substep.manifest.length > 0 ||
    substep.completed.length > 0 ||
    substep.runningId != null
  if (!hasProgress) return null

  const out: SubstepDisplayLines = {}
  const last = substep.completed[substep.completed.length - 1]
  if (last) {
    out.lastDone = {
      label: shortSubstepLabel(last.id),
      endedAt:
        last.durationSeconds > 0
          ? fmtDuration(last.durationSeconds, useBrightDate)
          : formatInstant(last.completedAtMs, useBrightDate),
    }
  }

  if (substep.runningId) {
    const elapsedSec = substep.runningElapsedSeconds
    const startedMs =
      substep.runningStartedAtMs ??
      (elapsedSec > 0 ? nowMs - elapsedSec * 1000 : nowMs)
    const progress = formatSubstepProgressLabel(substep) ?? '…'
    out.running = {
      label: shortSubstepLabel(substep.runningId),
      startedAt: formatInstant(startedMs, useBrightDate),
      progress,
      elapsed: fmtDuration(elapsedSec, useBrightDate),
    }
  }

  if (!out.lastDone && !out.running) return null
  return out
}
