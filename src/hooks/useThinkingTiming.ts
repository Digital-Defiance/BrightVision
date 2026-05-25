import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildTimingStatsView,
  loadThinkingStats,
  recordTurnTiming,
  saveThinkingStats,
  type ThinkingStatsStore,
  type TimingStatsView,
} from '../utils/thinkingStats'
import type { ThinkingTimingPrefs } from '../theme/thinkingTimingPrefs'
import {
  buildLiveThinkingState,
  createTurnTimingTracker,
  finalizeTurnTiming,
  formatDurationMs,
  syncTurnTimingFromContent,
  type LiveThinkingState,
  type TurnThinkingTiming,
  type TurnTimingTracker,
} from '../utils/thinkingTiming'
import { getActiveAssistantSection } from '../utils/chatStream'

export type { LiveThinkingState } from '../utils/thinkingTiming'

export function useThinkingTiming(model: string, prefs: ThinkingTimingPrefs) {
  const trackerRef = useRef<TurnTimingTracker | null>(null)
  const [live, setLive] = useState<LiveThinkingState | null>(null)
  const [statsStore, setStatsStore] = useState<ThinkingStatsStore>(() => loadThinkingStats())

  const statsView: TimingStatsView = buildTimingStatsView(
    statsStore,
    model.trim() || 'unknown'
  )

  const publishLive = useCallback(() => {
    const t = trackerRef.current
    if (!t) {
      setLive(null)
      return
    }
    setLive(buildLiveThinkingState(t))
  }, [])

  const beginTurn = useCallback(
    (promptChars: number) => {
      trackerRef.current = createTurnTimingTracker(promptChars)
      publishLive()
    },
    [publishLive]
  )

  const syncContent = useCallback(
    (content: string) => {
      const t = trackerRef.current
      if (!t) return
      trackerRef.current = syncTurnTimingFromContent(t, content)
      publishLive()
    },
    [publishLive]
  )

  const finalizeTurn = useCallback((content: string): TurnThinkingTiming | null => {
    const t = trackerRef.current
    if (!t) return null
    const result = finalizeTurnTiming(t, content)
    trackerRef.current = null
    setLive(null)
    return result
  }, [])

  const reset = useCallback(() => {
    trackerRef.current = null
    setLive(null)
  }, [])

  const recordCompletedTurn = useCallback(
    (timing: TurnThinkingTiming) => {
      if (timing.turnDurationMs <= 0) return
      setStatsStore((prev) => {
        const next = recordTurnTiming(prev, model, {
          thinkMs: timing.thoughtMs,
          promptChars: timing.userPromptChars,
          responseMs: timing.turnDurationMs,
        })
        saveThinkingStats(next)
        return next
      })
    },
    [model]
  )

  const refreshStats = useCallback(() => {
    setStatsStore(loadThinkingStats())
  }, [])

  useEffect(() => {
    if (!prefs.showLiveTimer) return
    publishLive()
    const id = window.setInterval(publishLive, 200)
    return () => window.clearInterval(id)
  }, [prefs.showLiveTimer, publishLive])

  return {
    live: prefs.showLiveTimer ? live : null,
    beginTurn,
    syncContent,
    finalizeTurn,
    reset,
    recordCompletedTurn,
    statsView,
    refreshStats,
    statsStore,
    formatDuration: formatDurationMs,
    peekActiveKind: (content: string) => getActiveAssistantSection(content),
  }
}
