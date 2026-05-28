import { useRef } from 'react'
import {
  etaCompletionFraction,
  monotonicEtaCompletionPercent,
  type TurnEtaEstimate,
} from '../utils/turnEtaEstimate'

/** Determinate 0–100 ETA bar value; null when ETA label is hidden. */
export function useMonotonicEtaProgress(
  eta: TurnEtaEstimate | null | undefined,
  elapsedMs: number
): number | null {
  const maxFractionRef = useRef(0)
  const prevRemainingRef = useRef<number | null>(null)

  const fraction = eta != null ? etaCompletionFraction(eta, elapsedMs) : null

  if (fraction == null) {
    maxFractionRef.current = 0
    prevRemainingRef.current = null
    return null
  }

  const remaining = eta?.remainingMs ?? null
  if (
    remaining != null &&
    prevRemainingRef.current != null &&
    remaining > prevRemainingRef.current * 1.08
  ) {
    // Estimate lengthened (e.g. p90 after median overrun) — bar must not stay near 100%.
    maxFractionRef.current = fraction
  }
  prevRemainingRef.current = remaining

  const { percent, maxFraction } = monotonicEtaCompletionPercent(
    maxFractionRef.current,
    fraction
  )
  maxFractionRef.current = maxFraction
  return percent
}
