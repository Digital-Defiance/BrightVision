import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import {
  RunProgressTracker,
  TestSuiteClient,
  type LabLanPairingPayload,
  type RunProgressSnapshot,
  type SuiteStepPlan,
} from '@brightvision/test-suite-client'

const PAIRING_KEY = 'brightvision-lab-remote-pairing'
const WAIT_POLL_MS = 2500
const LIVE_POLL_MS = 2000

function isRunLive(status: string): boolean {
  return status === 'pending' || status === 'running'
}

export async function loadSavedPairing(): Promise<LabLanPairingPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(PAIRING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LabLanPairingPayload
    if (parsed.v !== 1 || parsed.kind !== 'test-lab') return null
    return parsed
  } catch {
    return null
  }
}

export async function savePairing(payload: LabLanPairingPayload): Promise<void> {
  await AsyncStorage.setItem(PAIRING_KEY, JSON.stringify(payload))
}

export async function clearPairing(): Promise<void> {
  await AsyncStorage.removeItem(PAIRING_KEY)
}

export function useLabRunProgress(
  pairing: LabLanPairingPayload | null,
  opts?: { autoRefreshOnFocus?: boolean }
) {
  const [snapshot, setSnapshot] = useState<RunProgressSnapshot | null>(null)
  const [plan, setPlan] = useState<SuiteStepPlan[]>([])
  const [connected, setConnected] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const trackerRef = useRef(new RunProgressTracker())
  const waitPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const livePollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const planRef = useRef<SuiteStepPlan[]>([])
  const runIdRef = useRef<string | null>(null)
  const lastEventCountRef = useRef(0)

  const publish = useCallback(() => {
    setSnapshot(trackerRef.current.snapshot())
  }, [])

  const stopWaitPoll = useCallback(() => {
    if (waitPollRef.current) {
      clearInterval(waitPollRef.current)
      waitPollRef.current = null
    }
  }, [])

  const stopLivePoll = useCallback(() => {
    if (livePollRef.current) {
      clearInterval(livePollRef.current)
      livePollRef.current = null
    }
  }, [])

  const syncRunFromApi = useCallback(
    async (
      client: TestSuiteClient,
      id: string,
      steps: SuiteStepPlan[],
      reset: boolean
    ): Promise<string> => {
      const body = await client.fetchRun(id)
      if (reset) {
        trackerRef.current.initPlan(steps)
        lastEventCountRef.current = 0
      }
      for (const ev of body.events.slice(lastEventCountRef.current)) {
        trackerRef.current.apply(ev)
      }
      lastEventCountRef.current = body.events.length
      publish()
      return body.status
    },
    [publish]
  )

  const startLivePoll = useCallback(
    (client: TestSuiteClient, id: string, steps: SuiteStepPlan[]) => {
      stopLivePoll()
      livePollRef.current = setInterval(() => {
        void syncRunFromApi(client, id, steps, false)
          .then((status) => {
            if (!isRunLive(status)) stopLivePoll()
          })
          .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      }, LIVE_POLL_MS)
    },
    [stopLivePoll, syncRunFromApi]
  )

  /** Live run — REST snapshot first (reliable on RN), then poll for new events. */
  const attachLiveRun = useCallback(
    async (client: TestSuiteClient, id: string, steps: SuiteStepPlan[]) => {
      stopWaitPoll()
      stopLivePoll()
      runIdRef.current = id
      setRunId(id)
      const status = await syncRunFromApi(client, id, steps, true)
      if (isRunLive(status)) startLivePoll(client, id, steps)
    },
    [startLivePoll, stopLivePoll, stopWaitPoll, syncRunFromApi]
  )

  const loadSnapshotRun = useCallback(
    async (client: TestSuiteClient, id: string, steps: SuiteStepPlan[]) => {
      stopLivePoll()
      stopWaitPoll()
      runIdRef.current = id
      setRunId(id)
      await syncRunFromApi(client, id, steps, true)
    },
    [stopLivePoll, stopWaitPoll, syncRunFromApi]
  )

  const resolveRunTarget = useCallback(
    async (
      client: TestSuiteClient,
      pre: { activeRunInProgress?: boolean; activeRunId?: string | null }
    ): Promise<{ id: string; live: boolean } | null> => {
      if (pre.activeRunInProgress && pre.activeRunId) {
        return { id: pre.activeRunId, live: true }
      }

      const candidates = new Set<string>()
      if (pre.activeRunId) candidates.add(pre.activeRunId)
      if (runIdRef.current) candidates.add(runIdRef.current)

      for (const id of candidates) {
        try {
          const body = await client.fetchRun(id)
          if (isRunLive(body.status)) return { id, live: true }
          if (id === runIdRef.current) return { id, live: false }
        } catch {
          /* unknown run */
        }
      }

      return runIdRef.current ? { id: runIdRef.current, live: false } : null
    },
    []
  )

  const startWaitPoll = useCallback(
    (client: TestSuiteClient) => {
      stopWaitPoll()
      waitPollRef.current = setInterval(() => {
        void client.fetchPreflight().then((pre) => {
          if (pre.activeRunInProgress && pre.activeRunId) {
            void attachLiveRun(client, pre.activeRunId, planRef.current)
          }
        })
      }, WAIT_POLL_MS)
    },
    [attachLiveRun, stopWaitPoll]
  )

  const refresh = useCallback(async () => {
    if (!pairing) return
    const client = new TestSuiteClient(pairing.lanUrl, pairing.token)
    setRefreshing(true)
    setError(null)
    try {
      await client.health()
      setConnected(true)

      const pre = await client.fetchPreflight()
      const planBody = await client.fetchPlan(false)
      planRef.current = planBody.steps
      setPlan(planBody.steps)

      const target = await resolveRunTarget(client, pre)

      if (target?.live) {
        await attachLiveRun(client, target.id, planBody.steps)
      } else if (target) {
        await loadSnapshotRun(client, target.id, planBody.steps)
      } else {
        stopLivePoll()
        runIdRef.current = null
        setRunId(null)
        lastEventCountRef.current = 0
        trackerRef.current.initPlan(planBody.steps)
        publish()
        startWaitPoll(client)
      }
    } catch (e) {
      setConnected(false)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshing(false)
    }
  }, [
    attachLiveRun,
    loadSnapshotRun,
    pairing,
    publish,
    resolveRunTarget,
    startWaitPoll,
    stopLivePoll,
  ])

  useEffect(() => {
    runIdRef.current = runId
  }, [runId])

  /** Re-snapshot every second so server-anchored sub-step timers tick between polls. */
  useEffect(() => {
    if (!snapshot?.running || !snapshot.substep?.runningId) return
    const id = setInterval(() => publish(), 1000)
    return () => clearInterval(id)
  }, [snapshot?.running, snapshot?.substep?.runningId, publish])

  useEffect(() => {
    if (!pairing) {
      setConnected(false)
      setSnapshot(null)
      setPlan([])
      setRunId(null)
      runIdRef.current = null
      stopLivePoll()
      stopWaitPoll()
      return
    }

    void refresh()

    return () => {
      stopLivePoll()
      stopWaitPoll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial connect only when pairing changes
  }, [pairing])

  useEffect(() => {
    if (!opts?.autoRefreshOnFocus || !pairing) return
    const onState = (state: AppStateStatus) => {
      if (state === 'active') void refresh()
    }
    const sub = AppState.addEventListener('change', onState)
    return () => sub.remove()
  }, [opts?.autoRefreshOnFocus, pairing, refresh])

  return { snapshot, plan, connected, runId, error, refreshing, refresh }
}
