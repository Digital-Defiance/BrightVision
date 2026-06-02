import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentGuardPrefs } from '../theme/agentGuardPrefs'
import {
  agentLimitMessage,
  checkAgentLimits,
  formatAgentTurnsChip,
  parsePositiveInt,
  type AgentLimitBlockReason,
} from '../utils/agentGuard'

export type AgentPauseState = 'running' | 'paused' | 'pause_after_turn'

export interface AgentGuardSnapshot {
  completedTurns: number
  agentPhaseMs: number
  pauseState: AgentPauseState
  turnsChip: string
  blockReason: AgentLimitBlockReason
  maxTurns: number | null
}

export function useAgentGuard(
  prefs: AgentGuardPrefs,
  brightDate: boolean,
  isRunning: boolean,
  isBusy: boolean,
  agentTurnActive: boolean
) {
  const [completedTurns, setCompletedTurns] = useState(0)
  const [accumulatedMs, setAccumulatedMs] = useState(0)
  const [pauseState, setPauseState] = useState<AgentPauseState>('running')
  const [tick, setTick] = useState(0)
  const turnStartRef = useRef<number | null>(null)

  const reset = useCallback(() => {
    setCompletedTurns(0)
    setAccumulatedMs(0)
    setPauseState('running')
    turnStartRef.current = null
  }, [])

  useEffect(() => {
    if (!isRunning) reset()
  }, [isRunning, reset])

  const beginAgentPhase = useCallback(() => {
    if (turnStartRef.current == null) turnStartRef.current = Date.now()
  }, [])

  const endAgentPhase = useCallback(() => {
    const start = turnStartRef.current
    if (start != null) {
      setAccumulatedMs((ms) => ms + Math.max(0, Date.now() - start))
      turnStartRef.current = null
    }
    setCompletedTurns((n) => n + 1)
    setPauseState((p) => (p === 'pause_after_turn' ? 'paused' : p))
  }, [])

  const pause = useCallback(
    (afterCurrent = true) => {
      if (afterCurrent && isBusy) setPauseState('pause_after_turn')
      else setPauseState('paused')
    },
    [isBusy]
  )

  const resume = useCallback(() => {
    setPauseState('running')
  }, [])

  useEffect(() => {
    if (!isBusy || turnStartRef.current == null) return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [isBusy])

  const livePhaseMs = useMemo(() => {
    void tick
    const start = turnStartRef.current
    const running = start != null ? Math.max(0, Date.now() - start) : 0
    return accumulatedMs + running
  }, [accumulatedMs, tick])

  const maxTurns = parsePositiveInt(prefs.maxAgentTurns)

  const limitReason = useMemo(
    () =>
      checkAgentLimits({
        prefs,
        brightDate,
        completedAgentTurns: completedTurns,
        agentPhaseMs: livePhaseMs,
      }),
    [prefs, brightDate, completedTurns, livePhaseMs]
  )

  const blockReason: AgentLimitBlockReason =
    pauseState === 'paused'
      ? 'paused'
      : pauseState === 'pause_after_turn' && isBusy
        ? null
        : limitReason

  const snapshot: AgentGuardSnapshot = {
    completedTurns,
    agentPhaseMs: livePhaseMs,
    pauseState,
    turnsChip: formatAgentTurnsChip(completedTurns, maxTurns),
    blockReason: pauseState === 'paused' ? 'paused' : limitReason,
    maxTurns,
  }

  const shouldBlockSend =
    pauseState === 'paused' || (limitReason != null && !isBusy)

  const shouldInterrupt =
    isBusy &&
    agentTurnActive &&
    (limitReason === 'max_time' || limitReason === 'shutdown')

  return {
    snapshot,
    reset,
    beginAgentPhase,
    endAgentPhase,
    pause,
    resume,
    blockReason,
    blockMessage: blockReason ? agentLimitMessage(blockReason) : '',
    shouldBlockSend,
    shouldInterrupt,
  }
}
