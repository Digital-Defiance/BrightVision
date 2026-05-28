import {
  buildTimingStatsView,
  computeRunningAvgOutputTps,
  type ThinkingStatsStore,
} from './thinkingStats'
import { formatDurationMs } from './thinkingTiming'

export type TurnEtaConfidence = 'none' | 'low' | 'medium' | 'high'

export interface TurnEtaEstimate {
  /** Milliseconds until estimated turn end; null if unknown. */
  remainingMs: number | null
  /** Estimated total turn duration from Send. */
  totalMs: number | null
  /** Short label for the activity bar, e.g. `~2m left*`. */
  shortLabel: string | null
  tooltip: string
  confidence: TurnEtaConfidence
}

export interface TurnEtaInput {
  model: string
  promptChars: number
  elapsedMs: number
  statsStore: ThinkingStatsStore
  /** Core progress fraction 0–1 when determinate (repo scan, etc.). */
  progressFraction?: number | null
  /** Live output TPS from current turn usage line when available. */
  liveOutputTps?: number | null
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function promptScale(promptChars: number, baselineChars: number): number {
  if (baselineChars <= 0) return 1
  return clamp(promptChars / baselineChars, 0.5, 2)
}

/**
 * Estimate remaining turn time from per-model timing history (median + p90),
 * optional progress fraction, and historical output TPS when logged.
 */
export function estimateTurnEta(input: TurnEtaInput): TurnEtaEstimate {
  const model = input.model.trim() || 'unknown'
  const view = buildTimingStatsView(input.statsStore, model)
  const n = view.response.count

  if (n === 0) {
    return {
      remainingMs: null,
      totalMs: null,
      shortLabel: null,
      tooltip:
        'No timing history for this model yet. Complete a few turns to enable ETA estimates.',
      confidence: 'none',
    }
  }

  const median = view.response.median
  const p90 = view.response.p90
  const avgPrompt =
    view.history.reduce((sum, r) => sum + r.promptChars, 0) /
    Math.max(1, view.history.length)
  const scale = promptScale(input.promptChars, avgPrompt)
  let estimatedTotal = median * scale

  const histTps = computeRunningAvgOutputTps(
    input.statsStore.history.filter((r) => r.model === model)
  )
  const tps = input.liveOutputTps ?? histTps

  const progress = input.progressFraction
  if (progress != null && progress > 0.05 && progress < 0.98) {
    const fromProgress = input.elapsedMs / progress
    estimatedTotal = Math.max(estimatedTotal, fromProgress)
  }

  let remaining = Math.max(0, Math.round(estimatedTotal - input.elapsedMs))
  const p90Remaining = Math.max(0, Math.round(p90 * scale - input.elapsedMs))

  let confidence: TurnEtaConfidence = n >= 8 ? 'high' : n >= 3 ? 'medium' : 'low'
  if (progress != null && progress > 0.1) confidence = confidence === 'low' ? 'medium' : confidence

  const lines: string[] = [
    `Model: ${model}`,
    `History: ${n} turn${n === 1 ? '' : 's'} (median ${formatDurationMs(median)}, p90 ${formatDurationMs(p90)})`,
    `Prompt scale: ×${scale.toFixed(2)} (${input.promptChars.toLocaleString()} chars vs ~${Math.round(avgPrompt).toLocaleString()} avg)`,
    `Estimated total: ~${formatDurationMs(Math.round(estimatedTotal))}`,
  ]

  if (tps != null && tps > 0) {
    lines.push(`Output rate: ~${tps.toFixed(1)} tok/s (history or current turn usage)`)
  } else {
    lines.push(
      'Output tok/s not in history yet — ETA uses response time only. Usage lines like `1.2k ↑ 450 ↓` improve estimates.'
    )
  }

  if (progress != null && progress > 0) {
    lines.push(`Progress: ${Math.round(progress * 100)}% (blended into estimate)`)
  }

  lines.push(`Typical range: ${formatDurationMs(remaining)} – ${formatDurationMs(p90Remaining)} remaining`)
  lines.push(
    'GPU % (when logged) is not used for this estimate — correlation with time-left needs dogfood data (#34).'
  )

  if (remaining <= 0 && input.elapsedMs > estimatedTotal * 1.2) {
    remaining = Math.max(0, p90Remaining)
    lines.push('Running longer than median — using p90 for remaining time.')
  }

  // Bar and "~Xm left" must share one timeline (elapsed + remaining = total).
  if (remaining > 0) {
    estimatedTotal = Math.max(estimatedTotal, input.elapsedMs + remaining)
  }

  const shortLabel =
    remaining > 0 ? `~${formatDurationMs(remaining)} left*` : null

  return {
    remainingMs: remaining > 0 ? remaining : null,
    totalMs: Math.round(estimatedTotal),
    shortLabel,
    tooltip: lines.join('\n'),
    confidence,
  }
}

/** Whether the activity bar should show the ETA time-remaining label. */
export function isTurnEtaVisible(eta: TurnEtaEstimate | null | undefined): boolean {
  return Boolean(eta?.shortLabel)
}

/**
 * Fraction of estimated turn complete (0–1) from elapsed time vs estimated total.
 * Used for the determinate ETA progress bar; capped below 1 until the turn ends.
 */
export function etaCompletionFraction(
  eta: TurnEtaEstimate,
  elapsedMs: number
): number | null {
  if (!isTurnEtaVisible(eta) || eta.totalMs == null || eta.totalMs <= 0) {
    return null
  }
  if (eta.confidence === 'none') return null
  let fraction = elapsedMs / eta.totalMs
  if (eta.remainingMs != null && eta.remainingMs > 0) {
    fraction = (eta.totalMs - eta.remainingMs) / eta.totalMs
  }
  if (!Number.isFinite(fraction)) return null
  return clamp(fraction, 0, 0.98)
}

/** Monotonic 0–100 for ETA bar; never decreases when the estimate revises upward. */
export function monotonicEtaCompletionPercent(
  previousMaxFraction: number,
  fraction: number | null
): { percent: number | null; maxFraction: number } {
  if (fraction == null) {
    return { percent: null, maxFraction: 0 }
  }
  const maxFraction = Math.max(previousMaxFraction, fraction)
  return { percent: Math.round(maxFraction * 100), maxFraction }
}
