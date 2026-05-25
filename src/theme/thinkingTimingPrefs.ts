import { THINKING_TIMING_STORAGE_KEY } from '../storageKeys'

export { THINKING_TIMING_STORAGE_KEY }

export interface ThinkingTimingPrefs {
  showLiveTimer: boolean
  showSectionDurations: boolean
  showMessageTurnTotal: boolean
  showStatsInSettings: boolean
}

export const DEFAULT_THINKING_TIMING_PREFS: ThinkingTimingPrefs = {
  showLiveTimer: true,
  showSectionDurations: true,
  showMessageTurnTotal: true,
  showStatsInSettings: true,
}

export function loadThinkingTimingPrefs(): ThinkingTimingPrefs {
  try {
    const raw = localStorage.getItem(THINKING_TIMING_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_THINKING_TIMING_PREFS }
    const parsed = JSON.parse(raw) as Partial<ThinkingTimingPrefs>
    return { ...DEFAULT_THINKING_TIMING_PREFS, ...parsed }
  } catch {
    return { ...DEFAULT_THINKING_TIMING_PREFS }
  }
}

export function saveThinkingTimingPrefs(prefs: ThinkingTimingPrefs): void {
  localStorage.setItem(THINKING_TIMING_STORAGE_KEY, JSON.stringify(prefs))
}
