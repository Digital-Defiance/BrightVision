import { formatDurationBrightDate } from '@brightvision/vision-client/brightdateTiming'

export function fmtDuration(sec: number, useBrightDate = false): string {
  if (useBrightDate) return formatDurationBrightDate(sec)
  if (sec < 60) return `${sec.toFixed(0)}s`
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h}h ${rm}m` : `${h}h`
}
