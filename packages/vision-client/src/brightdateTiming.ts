/**
 * BrightDate UI helpers — conversions/labels from `@brightchain/brightdate`,
 * duration/ETC formatting aligned with PyPI `brightdate` 0.1.x (seconds → md/d).
 */

import {
  J2000_UTC_UNIX_MS,
  SECONDS_PER_DAY,
  fromUnixMs,
  now as brightDateNow,
} from '@brightchain/brightdate'
import { formatBD } from '@brightchain/brightdate'

/** J2000.0 UTC label (spec §2.2) — same as `brightdate.J2000_UNIX_MS` on PyPI. */
export const J2000_UNIX_MS = J2000_UTC_UNIX_MS

const SECONDS_PER_MD = 86.4
const SECONDS_PER_BD = SECONDS_PER_DAY

export function bdFromUnixMs(ms: number): number {
  return fromUnixMs(ms)
}

export function bdAddSeconds(bd: number, seconds: number): number {
  return bd + seconds / SECONDS_PER_BD
}

export function bdFromUnixSeconds(sec: number): number {
  return fromUnixMs(sec * 1000)
}

export function formatBdScalar(bd: number, precision = 5): string {
  return formatBD(bd, precision)
}

export function formatDurationBrightDate(sec: number): string {
  if (sec < 0) sec = 0
  const md = sec / SECONDS_PER_MD
  if (sec < SECONDS_PER_MD) return `${md.toFixed(2)} md`
  const days = sec / SECONDS_PER_BD
  return `${days.toFixed(5)} d (${md.toFixed(1)} md)`
}

export function formatDurationMsBrightDate(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  return formatDurationBrightDate(ms / 1000)
}

export function formatBdBounds(startBd?: number, endBd?: number, precision = 5): string | null {
  if (startBd == null || endBd == null) return null
  return `${formatBdScalar(startBd, precision)} → ${formatBdScalar(endBd, precision)}`
}

export function formatEtcBrightDate(secondsFromNow: number, nowBd?: number): string {
  const base = nowBd ?? brightDateNow()
  return formatBdScalar(bdAddSeconds(base, secondsFromNow))
}
