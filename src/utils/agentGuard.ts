import { bdFromUnixMs } from '@brightvision/vision-client'
import type { AgentGuardPrefs, AgentTimeUnit } from '../theme/agentGuardPrefs'

const SECONDS_PER_MD = 86.4
const SECONDS_PER_DAY = 86400

export function agentTimeUnitOptions(brightDate: boolean): { value: AgentTimeUnit; label: string }[] {
  if (brightDate) {
    return [
      { value: 'md', label: 'millidays (md)' },
      { value: 'd', label: 'days (d)' },
    ]
  }
  return [
    { value: 'sec', label: 'seconds' },
    { value: 'min', label: 'minutes' },
    { value: 'hr', label: 'hours' },
  ]
}

export function normalizeAgentTimeUnit(
  unit: AgentTimeUnit,
  brightDate: boolean
): AgentTimeUnit {
  const allowed = agentTimeUnitOptions(brightDate).map((o) => o.value)
  if (allowed.includes(unit)) return unit
  return brightDate ? 'md' : 'min'
}

export function parsePositiveInt(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null
  return n
}

export function parseMaxAgentTimeMs(
  value: string,
  unit: AgentTimeUnit,
  brightDate: boolean
): number | null {
  const t = value.trim()
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n <= 0) return null
  const u = normalizeAgentTimeUnit(unit, brightDate)
  switch (u) {
    case 'sec':
      return n * 1000
    case 'min':
      return n * 60_000
    case 'hr':
      return n * 3_600_000
    case 'md':
      return n * SECONDS_PER_MD * 1000
    case 'd':
      return n * SECONDS_PER_DAY * 1000
    default:
      return null
  }
}

/** Parse shutdown deadline as unix ms, or null when unset/invalid. */
export function parseShutdownDeadlineMs(
  shutdownAt: string,
  brightDate: boolean,
  nowMs = Date.now()
): number | null {
  const t = shutdownAt.trim()
  if (!t) return null
  if (brightDate) {
    const bd = Number(t)
    if (!Number.isFinite(bd)) return null
    const nowBd = bdFromUnixMs(nowMs)
    if (bd <= nowBd) return null
    const deltaSec = (bd - nowBd) * SECONDS_PER_DAY
    return nowMs + deltaSec * 1000
  }
  const ms = Date.parse(t)
  if (!Number.isFinite(ms) || ms <= nowMs) return null
  return ms
}

export type AgentLimitBlockReason =
  | 'paused'
  | 'max_turns'
  | 'max_time'
  | 'shutdown'
  | null

export interface AgentLimitCheckInput {
  prefs: AgentGuardPrefs
  brightDate: boolean
  completedAgentTurns: number
  agentPhaseMs: number
  nowMs?: number
}

export function checkAgentLimits(input: AgentLimitCheckInput): AgentLimitBlockReason {
  const now = input.nowMs ?? Date.now()
  const maxTurns = parsePositiveInt(input.prefs.maxAgentTurns)
  if (maxTurns != null && input.completedAgentTurns >= maxTurns) {
    return 'max_turns'
  }
  const maxMs = parseMaxAgentTimeMs(
    input.prefs.maxAgentTimeValue,
    input.prefs.maxAgentTimeUnit,
    input.brightDate
  )
  if (maxMs != null && input.agentPhaseMs >= maxMs) {
    return 'max_time'
  }
  const shutdownMs = parseShutdownDeadlineMs(input.prefs.shutdownAt, input.brightDate, now)
  if (shutdownMs != null && now >= shutdownMs) {
    return 'shutdown'
  }
  return null
}

export function agentLimitMessage(reason: AgentLimitBlockReason): string {
  switch (reason) {
    case 'paused':
      return 'Agent is paused — send /resume to continue.'
    case 'max_turns':
      return 'Maximum agent turns reached (Settings → Agents).'
    case 'max_time':
      return 'Maximum agent time reached (Settings → Agents).'
    case 'shutdown':
      return 'Agent shutdown time reached (Settings → Agents).'
    default:
      return 'Agent cannot run.'
  }
}

export function formatAgentTurnsChip(completed: number, max: number | null): string {
  if (max == null) return completed > 0 ? `Agent turns ${completed}` : ''
  return `Agent ${completed}/${max}`
}
