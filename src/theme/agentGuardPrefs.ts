import { AGENT_GUARD_STORAGE_KEY } from '../storageKeys'

export { AGENT_GUARD_STORAGE_KEY }

/** Duration unit for max agent time (subset depends on BrightDate mode in UI). */
export type AgentTimeUnit = 'sec' | 'min' | 'hr' | 'md' | 'd'

export interface AgentGuardPrefs {
  /** Empty = no limit; positive integer string only. */
  maxAgentTurns: string
  maxAgentTimeValue: string
  maxAgentTimeUnit: AgentTimeUnit
  /** Conventional: `datetime-local` value (local TZ). BrightDate: absolute BD scalar string. */
  shutdownAt: string
}

export const DEFAULT_AGENT_GUARD_PREFS: AgentGuardPrefs = {
  maxAgentTurns: '',
  maxAgentTimeValue: '',
  maxAgentTimeUnit: 'min',
  shutdownAt: '',
}

export function loadAgentGuardPrefs(): AgentGuardPrefs {
  try {
    const raw = localStorage.getItem(AGENT_GUARD_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_AGENT_GUARD_PREFS }
    const parsed = JSON.parse(raw) as Partial<AgentGuardPrefs>
    return { ...DEFAULT_AGENT_GUARD_PREFS, ...parsed }
  } catch {
    return { ...DEFAULT_AGENT_GUARD_PREFS }
  }
}

export function saveAgentGuardPrefs(prefs: AgentGuardPrefs): void {
  localStorage.setItem(AGENT_GUARD_STORAGE_KEY, JSON.stringify(prefs))
}
