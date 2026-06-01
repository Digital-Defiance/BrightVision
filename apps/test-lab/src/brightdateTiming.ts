/** BrightDate scalar helpers for Test Lab ETC/duration display ([brightdate.org](https://brightdate.org)). */

/** J2000.0 = 2000-01-01T11:58:55.816Z */
const J2000_UNIX_MS = 946_684_800_816
const MS_PER_BD = 86_400_000
const SECONDS_PER_MD = 86.4

export function bdFromUnixMs(ms: number): number {
  return (ms - J2000_UNIX_MS) / MS_PER_BD
}

export function formatBdScalar(bd: number, precision = 5): string {
  if (bd >= 0) {
    const txt = bd.toFixed(precision).replace(/\.?0+$/, '')
    return `BD ${txt || '0'}`
  }
  const txt = Math.abs(bd).toFixed(precision).replace(/\.?0+$/, '')
  return `PBD ${txt || '0'}`
}

export function fmtDurationBrightDate(sec: number): string {
  if (sec < 0) sec = 0
  const md = sec / SECONDS_PER_MD
  if (sec < SECONDS_PER_MD) return `${md.toFixed(2)} md`
  const days = sec / 86400
  return `${days.toFixed(5)} d (${md.toFixed(1)} md)`
}

export function formatBdBounds(startBd?: number, endBd?: number, precision = 5): string | null {
  if (startBd == null || endBd == null) return null
  return `BD ${startBd.toFixed(precision).replace(/\.?0+$/, '')} → ${endBd
    .toFixed(precision)
    .replace(/\.?0+$/, '')}`
}

export function formatEtcBrightDate(secondsFromNow: number): string {
  return formatBdScalar(bdFromUnixMs(Date.now() + secondsFromNow * 1000))
}
