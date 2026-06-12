import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildTimingStatsView,
  loadThinkingStats,
  recordTurnTiming,
  saveThinkingStats,
  type ThinkingStatsStore,
  type TimingStatsView,
  type TurnTimingRecord,
} from '../utils/thinkingStats'
import type { ThinkingTimingPrefs } from '../theme/thinkingTimingPrefs'
import {
  buildLiveThinkingState,
  createTurnTimingTracker,
  finalizeTurnTiming,
  finalizeTurnTimingFromWallClock,
  formatDurationMs,
  syncTurnTimingFromContent,
  type LiveThinkingState,
  type TurnThinkingTiming,
  type TurnTimingTracker,
} from '../utils/thinkingTiming'
import { getActiveAssistantSection } from '../utils/chatStream'
import {
  hasTurnResourceStats,
  type TurnResourceStats,
} from '../ipc/resourceSnapshot'

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
    (promptChars: number, turnStartMs = Date.now()) => {
      trackerRef.current = createTurnTimingTracker(promptChars, turnStartMs)
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

  const finalizeTurn = useCallback(
    (
      content: string,
      opts?: { wallStartMs?: number; promptChars?: number }
    ): TurnThinkingTiming | null => {
      const now = Date.now()
      const t = trackerRef.current
      if (!t) {
        if (opts?.wallStartMs == null) return null
        const result = finalizeTurnTimingFromWallClock(
          opts.wallStartMs,
          opts.promptChars ?? 0,
          content,
          now
        )
        setLive(null)
        return result
      }
      const result = finalizeTurnTiming(t, content, now, {
        turnStartMs: opts?.wallStartMs,
      })
      trackerRef.current = null
      setLive(null)
      return result
    },
    []
  )

  const reset = useCallback(() => {
    trackerRef.current = null
    setLive(null)
  }, [])

  const recordCompletedTurn = useCallback(
    (
      timing: TurnThinkingTiming,
      resources?: TurnResourceStats,
      tokens?: { tokensSent: number; tokensReceived: number },
      extras?: {
        startBd?: number
        endBd?: number
        memPressurePeak?: number
        captureMode?: string
      },
      routedModel?: string
    ): TurnTimingRecord | null => {
      if (timing.turnDurationMs <= 0) return null
      let recorded: TurnTimingRecord | null = null
      const effectiveModel = routedModel?.trim() || model
      setStatsStore((prev) => {
        const next = recordTurnTiming(prev, effectiveModel, {
          thinkMs: timing.thoughtMs,
          promptChars: timing.userPromptChars,
          responseMs: timing.turnDurationMs,
          ...(tokens
            ? {
                tokensSent: tokens.tokensSent,
                tokensReceived: tokens.tokensReceived,
              }
            : {}),
          ...(resources && hasTurnResourceStats(resources)
            ? {
                peakCpuPct: resources.peakCpuPct,
                avgCpuPct: resources.avgCpuPct,
                peakMemPct: resources.peakMemPct,
                avgMemPct: resources.avgMemPct,
                peakGpuPct: resources.peakGpuPct,
                avgGpuPct: resources.avgGpuPct,
                resourceSampleCount: resources.sampleCount,
              }
            : {}),
          ...(extras?.startBd != null ? { startBd: extras.startBd } : {}),
          ...(extras?.endBd != null ? { endBd: extras.endBd } : {}),
          ...(extras?.memPressurePeak != null
            ? { memPressurePeak: extras.memPressurePeak }
            : {}),
          ...(extras?.captureMode ? { captureMode: extras.captureMode } : {}),
        })
        recorded = next.history[next.history.length - 1] ?? null
        saveThinkingStats(next)
        return next
      })
      return recorded
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

  const formatDuration = useCallback(
    (ms: number) => formatDurationMs(ms, { brightDate: prefs.brightDateMode }),
    [prefs.brightDateMode]
  )

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
    formatDuration,
    brightDateMode: prefs.brightDateMode,
    peekActiveKind: (content: string) => getActiveAssistantSection(content),
  }
}
