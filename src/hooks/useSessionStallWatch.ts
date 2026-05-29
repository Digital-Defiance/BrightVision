import { useEffect, useRef, useState } from 'react'
import {
  buildTurnActivity,
  isLikelyStalled,
  turnActivityHint,
  type TurnActivitySnapshot,
} from '../utils/sessionStall'

export interface SessionStallWatch {
  activity: TurnActivitySnapshot
  hint: string
  stalled: boolean
  touchEvent: (type: string, detail?: string) => void
}

export function useSessionStallWatch(
  isBusy: boolean,
  queuedCount: number,
  sessionModel = ''
): SessionStallWatch {
  const lastEventAtRef = useRef<number | null>(null)
  const lastTokenAtRef = useRef<number | null>(null)
  const lastProgressDetailRef = useRef('')
  const [tick, setTick] = useState(0)

  const touchEvent = (type: string, detail?: string) => {
    const now = Date.now()
    lastEventAtRef.current = now
    if (type === 'token') lastTokenAtRef.current = now
    if (type === 'progress' && detail) lastProgressDetailRef.current = detail
    if (type === 'done' || type === 'error') {
      lastEventAtRef.current = null
      lastTokenAtRef.current = null
      lastProgressDetailRef.current = ''
    }
  }

  useEffect(() => {
    if (!isBusy) {
      lastEventAtRef.current = null
      lastTokenAtRef.current = null
      lastProgressDetailRef.current = ''
      return
    }
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [isBusy])

  void tick

  const activity = buildTurnActivity(
    isBusy,
    lastEventAtRef.current,
    lastTokenAtRef.current,
    lastProgressDetailRef.current
  )
  const stalled = isLikelyStalled(activity)
  const hint = turnActivityHint(activity, queuedCount, sessionModel)

  return { activity, hint, stalled, touchEvent }
}
