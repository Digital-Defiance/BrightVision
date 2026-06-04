import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import BoltIcon from '@mui/icons-material/Bolt'
import SkipNextIcon from '@mui/icons-material/SkipNext'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import StepLogPanel, { STEP_LOG_MAX_LINES } from './StepLogPanel'
import { StepChipIcons } from './stepChipIcons'
import SuiteProgressTable from './SuiteProgressTable'
import {
  cancelActiveRun,
  cancelRun,
  clearSuiteBaseCache,
  fetchExpectations,
  fetchPlan,
  fetchPreflight,
  fetchTranscriptDigest,
  fmtDuration,
  resolveSuiteBaseUrl,
  restartOrchestratorFromShell,
  revealPathInFinder,
  startRun,
  streamRunEvents,
  waitForOrchestrator,
  type SuiteLaneOptions,
  type SuiteStepPlan,
  type TestSuiteEvent,
} from './testSuiteClient'
import { NtfyLabSettings } from './NtfyLabSettings'
import { maybeNotifySuiteRunFinished } from './ntfyLab'
import {
  loadTestLabNtfyPrefs,
  saveTestLabNtfyPrefs,
  type TestLabNtfyPrefs,
} from './ntfyLabPrefs'
import {
  loadTestLabRunPrefs,
  saveTestLabRunPrefs,
  type TestLabRunPrefs,
} from './testLabPrefs'
import {
  loadSuiteResume,
  resumeStepFromStatuses,
  saveSuiteResume,
  suitePlanKey,
  type SuiteResumeState,
} from './suiteResume'
import {
  stepTimingLabels,
  suiteRunningTimingSummary,
  suiteProgressPercent,
  computeEtcAnchors,
  computeRunEtcPlan,
  fmtDurationBrightDate,
  formatBdBounds,
  type EtcAnchors,
  type RunEtcPlan,
  type StepMedian,
} from './stepTiming'
import {
  parseTestMarkerLine,
  PlaywrightLineTracker,
  shouldShowLiveTestMarker,
  shouldUpdateLatestTestMarker,
  type TestMarker,
} from './testProgressParser'

type StepState = {
  id: string
  label: string
  status: 'pending' | 'running' | 'ok' | 'fail' | 'skipped'
  /** Step failed because short-circuit killed the subprocess on a test FAIL line. */
  shortCircuit?: boolean
  lines: string[]
  seconds?: number
  gpuAvg?: number
  gpuPeak?: number
  memAvg?: number
  memPeak?: number
  memPressurePeak?: number
  swapPeakGb?: number
  /** Live samples from heartbeats while step is running */
  liveGpuAvg?: number
  liveGpuPeak?: number
  liveMemAvg?: number
  liveMemPeak?: number
  gpuWarn?: boolean
  gpuExpectedPeak?: number
  startBd?: number
  endBd?: number
}

export default function App() {
  const [runPrefs, setRunPrefs] = useState<TestLabRunPrefs>(() => loadTestLabRunPrefs())
  const {
    skipLlm,
    specGenPhased,
    llmRouter,
    cloudLlm,
    verifyEars,
    shippedScenarios,
    strictPhasedPytest,
    skipGpu,
    useBrightDate,
    saveTranscript,
    failFast,
    shortCircuit,
  } = runPrefs

  const patchRunPrefs = (patch: Partial<TestLabRunPrefs>) => {
    setRunPrefs((prev) => {
      const next = { ...prev, ...patch }
      saveTestLabRunPrefs(next)
      return next
    })
  }
  const [cloudLlmConfigured, setCloudLlmConfigured] = useState(false)
  const [routerLaneReady, setRouterLaneReady] = useState(false)
  const [routerLaneDetail, setRouterLaneDetail] = useState('')
  const [btimeOnPath, setBtimeOnPath] = useState(true)
  const [transcriptPath, setTranscriptPath] = useState<string | null>(null)
  const [digestMsg, setDigestMsg] = useState<string | null>(null)
  const [plan, setPlan] = useState<SuiteStepPlan[]>([])
  const [repoRoot, setRepoRoot] = useState('')
  const [coreWarning, setCoreWarning] = useState(false)
  const [etaTotal, setEtaTotal] = useState(0)
  const [stepMedians, setStepMedians] = useState<Record<string, StepMedian>>({})
  const [running, setRunning] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [steps, setSteps] = useState<StepState[]>([])
  const [progress, setProgress] = useState({
    index: 0,
    total: 0,
    elapsed: 0,
    stepElapsed: 0,
  })
  const [runClockStartedAt, setRunClockStartedAt] = useState<number | null>(null)
  const [stepClockStartedAt, setStepClockStartedAt] = useState<number | null>(null)
  const [stepTick, setStepTick] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [runOk, setRunOk] = useState<boolean | null>(null)
  const [captureMode, setCaptureMode] = useState<string | null>(null)
  const [captureNote, setCaptureNote] = useState<string | null>(null)
  const [runUseBrightDate, setRunUseBrightDate] = useState(false)
  const [orchReady, setOrchReady] = useState(false)
  const [orchLoading, setOrchLoading] = useState(true)
  const [orchPort, setOrchPort] = useState(8743)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [ntfyPrefs, setNtfyPrefs] = useState<TestLabNtfyPrefs>(() => loadTestLabNtfyPrefs())
  const ntfyPrefsRef = useRef(ntfyPrefs)
  const [ntfyMsg, setNtfyMsg] = useState<string | null>(null)
  const [latestTestMarker, setLatestTestMarker] = useState<TestMarker | null>(null)
  const playwrightTrackerRef = useRef(new PlaywrightLineTracker())
  const [etcAnchors, setEtcAnchors] = useState<EtcAnchors | null>(null)
  const [runEtcPlan, setRunEtcPlan] = useState<RunEtcPlan | null>(null)
  const runUseBrightDateRef = useRef(false)

  useEffect(() => {
    ntfyPrefsRef.current = ntfyPrefs
  }, [ntfyPrefs])

  const handleNtfyPrefsChange = (next: TestLabNtfyPrefs) => {
    setNtfyPrefs(next)
    saveTestLabNtfyPrefs(next)
  }

  useEffect(() => {
    runUseBrightDateRef.current = runUseBrightDate
  }, [runUseBrightDate])

  const laneOpts: SuiteLaneOptions = useMemo(
    () => ({
      specGenPhased,
      llmRouter,
      cloudLlm,
      verifyEars,
      shippedScenarios,
      strictPhasedPytest,
    }),
    [specGenPhased, llmRouter, cloudLlm, verifyEars, shippedScenarios, strictPhasedPytest]
  )

  const refreshMeta = useCallback(async () => {
    setOrchLoading(true)
    setError(null)
    try {
      clearSuiteBaseCache()
      await resolveSuiteBaseUrl(true)
      await waitForOrchestrator()
      setOrchReady(true)
      const [p, exp, pre] = await Promise.all([
        fetchPlan(skipLlm, laneOpts),
        fetchExpectations(skipLlm, laneOpts),
        fetchPreflight(),
      ])
      setOrchPort(pre.orchestratorPort ?? 8743)
      setActiveRunId(pre.activeRunInProgress ? pre.activeRunId ?? null : null)
      setPlan(p.steps)
      setRepoRoot(p.repoRoot)
      setEtaTotal(exp.totalExpectedSeconds)
      const medMap: Record<string, StepMedian> = {}
      for (const row of exp.steps) {
        medMap[row.stepId] = {
          medianSeconds: row.medianSeconds,
          sampleCount: row.sampleCount,
          medianGpuPeak: row.medianGpuPeak,
          medianGpuAvg: row.medianGpuAvg,
          gpuSampleCount: row.gpuSampleCount,
        }
      }
      setStepMedians(medMap)
      setCoreWarning(pre.corePortInUse)
      setCloudLlmConfigured(!!pre.cloudLlmConfigured)
      setRouterLaneReady(!!pre.routerLaneReady)
      setRouterLaneDetail(pre.routerLaneDetail ?? '')
      setBtimeOnPath(pre.btimeOnPath !== false)
      if (pre.specGenPhasedEnv) patchRunPrefs({ specGenPhased: true })
      setSteps(
        p.steps.map((s) => ({
          id: s.id,
          label: s.label,
          status: 'pending',
          lines: [],
        }))
      )
    } catch (e) {
      setOrchReady(false)
      let msg = (e as Error).message
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const spawnErr = await invoke<string | null>('get_orchestrator_error')
        if (spawnErr) msg = `${msg}\n${spawnErr}`
      } catch {
        /* not in Tauri */
      }
      setError(msg)
    } finally {
      setOrchLoading(false)
    }
  }, [skipLlm, laneOpts])

  const handleCopyDigest = async () => {
    if (!transcriptPath) return
    setDigestMsg(null)
    setError(null)
    try {
      const { digest, chars } = await fetchTranscriptDigest(transcriptPath)
      await navigator.clipboard.writeText(digest)
      setDigestMsg(`Copied agent digest (${chars.toLocaleString()} chars, heartbeats collapsed)`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleRevealTranscript = async () => {
    if (!transcriptPath) return
    setError(null)
    try {
      await revealPathInFinder(transcriptPath)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleRestartOrchestrator = async () => {
    setError(null)
    setOrchLoading(true)
    try {
      await restartOrchestratorFromShell()
      await refreshMeta()
    } catch (e) {
      setOrchReady(false)
      setError((e as Error).message)
      setOrchLoading(false)
    }
  }

  useEffect(() => {
    void refreshMeta()
  }, [refreshMeta])

  useEffect(() => {
    if (!running || runClockStartedAt == null) return
    const tick = () => {
      const elapsed = (Date.now() - runClockStartedAt) / 1000
      setProgress((p) => ({ ...p, elapsed }))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [running, runClockStartedAt])

  const runningPlanIndex = useMemo(
    () => steps.findIndex((s) => s.status === 'running'),
    [steps]
  )

  useEffect(() => {
    if (!running || stepClockStartedAt == null) return
    const id = window.setInterval(() => setStepTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [running, stepClockStartedAt])

  const displayStepElapsed = useMemo(() => {
    if (stepClockStartedAt != null) {
      const local = (Date.now() - stepClockStartedAt) / 1000
      return Math.max(progress.stepElapsed, local)
    }
    return progress.stepElapsed
  }, [stepClockStartedAt, progress.stepElapsed, stepTick])

  const pct = useMemo(
    () =>
      suiteProgressPercent({
        plan,
        steps,
        medians: stepMedians,
        stepElapsed: displayStepElapsed,
        etaTotal,
      }),
    [plan, steps, stepMedians, displayStepElapsed, etaTotal]
  )

  const activeStepTiming = useMemo(() => {
    if (!running || runningPlanIndex < 0) return null
    return suiteRunningTimingSummary({
      runningPlanIndex,
      plan,
      steps,
      medians: stepMedians,
      runningStepElapsed: displayStepElapsed,
      useBrightDate: runUseBrightDate,
      anchors: etcAnchors,
      etcPlan: runEtcPlan,
    })
  }, [running, runningPlanIndex, plan, steps, stepMedians, displayStepElapsed, runUseBrightDate, etcAnchors, runEtcPlan])

  const currentPlanKey = useMemo(
    () => (plan.length ? suitePlanKey(plan, skipLlm, laneOpts) : ''),
    [plan, skipLlm, laneOpts]
  )

  const resumeOffer = useMemo((): SuiteResumeState | null => {
    if (running || plan.length === 0) return null
    const fromSteps = resumeStepFromStatuses(plan, steps)
    if (fromSteps) {
      return {
        planKey: currentPlanKey,
        startFromStepId: fromSteps.id,
        startFromLabel: fromSteps.label,
        updatedAt: Date.now(),
      }
    }
    const saved = loadSuiteResume()
    if (!saved || saved.planKey !== currentPlanKey) return null
    if (!plan.some((p) => p.id === saved.startFromStepId)) return null
    return saved
  }, [running, plan, steps, currentPlanKey])

  const persistResumePoint = useCallback(
    (nextSteps: StepState[], ok: boolean, cancelled?: boolean) => {
      if (!currentPlanKey || ok) {
        saveSuiteResume(null)
        return
      }
      const target = resumeStepFromStatuses(plan, nextSteps)
      if (!target) {
        saveSuiteResume(null)
        return
      }
      saveSuiteResume({
        planKey: currentPlanKey,
        startFromStepId: target.id,
        startFromLabel: target.label,
        updatedAt: Date.now(),
      })
      if (cancelled) {
        /* keep resume point at cancelled/failed step */
      }
    },
    [currentPlanKey, plan]
  )

  const handleRun = async (startFromStepId?: string | null) => {
    setError(null)
    setRunOk(null)
    setTranscriptPath(null)
    setRunning(true)
    setRunClockStartedAt(Date.now())
    const startIdx = startFromStepId ? plan.findIndex((p) => p.id === startFromStepId) : -1
    setProgress({
      index: startIdx >= 0 ? startIdx + 1 : 0,
      total: plan.length,
      elapsed: 0,
      stepElapsed: 0,
    })
    setLatestTestMarker(null)
    playwrightTrackerRef.current.reset()
    setEtcAnchors(null)
    setRunEtcPlan(null)
    setStepClockStartedAt(null)
    runUseBrightDateRef.current = useBrightDate
    setSteps((prev) =>
      prev.map((s) => {
        const idx = plan.findIndex((p) => p.id === s.id)
        if (startIdx >= 0 && idx >= 0 && idx < startIdx) {
          return {
            ...s,
            status: 'skipped' as const,
            lines: ['(skipped — resume from later step)'],
          }
        }
        return { ...s, status: 'pending' as const, lines: [] }
      })
    )
    try {
      const { run_id, transcript_path } = await startRun({
        skipLlm,
        skipGpu,
        saveTranscript,
        useBrightDate,
        failFast,
        shortCircuit,
        startFromStepId: startFromStepId ?? undefined,
        ...laneOpts,
      })
      setRunUseBrightDate(useBrightDate)
      setRunId(run_id)
      if (transcript_path) setTranscriptPath(transcript_path)
      streamRunEvents(
        run_id,
        (ev) => applyEvent(ev),
        () => {
          setRunning(false)
        },
        (err) => {
          setError(err.message)
          setRunning(false)
        }
      )
    } catch (e) {
      const msg = (e as Error).message
      if (msg.includes('already in progress')) {
        setActiveRunId((id) => id ?? 'active')
      }
      setError(msg)
      setRunning(false)
    }
  }

  const applyEvent = (ev: TestSuiteEvent) => {
    if (ev.type === 'run_started') {
      if (ev.captureMode) setCaptureMode(ev.captureMode)
      if (ev.captureNote) setCaptureNote(ev.captureNote)
      if (ev.useBrightDate != null) {
        runUseBrightDateRef.current = ev.useBrightDate
        setRunUseBrightDate(ev.useBrightDate)
      }
    }
    if (ev.type === 'progress') {
      setProgress((p) => {
        const newIndex = ev.stepIndex || p.index
        const stepIndexAdvanced =
          ev.stepIndex != null && ev.stepIndex > 0 && ev.stepIndex !== p.index
        if (stepIndexAdvanced) {
          setStepClockStartedAt(Date.now())
        }
        return {
          index: newIndex,
          total: ev.totalSteps || p.total,
          elapsed: Math.max(p.elapsed, ev.elapsedSeconds || 0),
          stepElapsed: ev.stepElapsedSeconds ?? (stepIndexAdvanced ? 0 : p.stepElapsed),
        }
      })
    }
    if (ev.type === 'step_started' && ev.stepId) {
      playwrightTrackerRef.current.reset()
      setLatestTestMarker(null)
      const idx = plan.findIndex((s) => s.id === ev.stepId)
      setStepClockStartedAt(Date.now())
      setProgress((p) => ({
        ...p,
        stepElapsed: 0,
        index: idx >= 0 ? idx + 1 : p.index,
      }))
      setSteps((prev) => {
        const next = prev.map((s) =>
          s.id === ev.stepId
            ? { ...s, status: 'running' as const, gpuWarn: false, gpuExpectedPeak: undefined }
            : s
        )
        const idx = plan.findIndex((s) => s.id === ev.stepId)
        if (idx >= 0) {
          const planArgs = {
            runningPlanIndex: idx,
            plan,
            steps: next,
            medians: stepMedians,
            runningStepElapsed: 0,
            useBrightDate: runUseBrightDateRef.current,
          }
          setEtcAnchors(computeEtcAnchors(planArgs))
          setRunEtcPlan(computeRunEtcPlan(planArgs))
        }
        return next
      })
    }
    if (ev.type === 'step_skipped' && ev.stepId) {
      setSteps((prev) =>
        prev.map((s) =>
          s.id === ev.stepId
            ? {
                ...s,
                status: 'skipped' as const,
                lines: [...s.lines, `(skipped — ${ev.reason ?? 'resume'})`],
              }
            : s
        )
      )
    }
    if (ev.type === 'step_line' && ev.stepId && ev.line) {
      const prefix = ev.stream === 'stderr' ? '[stderr] ' : ''
      const trackerMarkers = playwrightTrackerRef.current.feed(ev.line)
      const markers =
        trackerMarkers.length > 0
          ? trackerMarkers
          : (() => {
              const marker = parseTestMarkerLine(ev.line)
              return marker ? [marker] : []
            })()
      for (const marker of markers) {
        if (shouldShowLiveTestMarker(marker)) {
          setLatestTestMarker(marker)
        }
      }
      setSteps((prev) =>
        prev.map((s) =>
          s.id === ev.stepId
            ? {
                ...s,
                lines: [...s.lines.slice(-STEP_LOG_MAX_LINES), prefix + ev.line!],
              }
            : s
        )
      )
    }
    if (ev.type === 'step_util' && ev.stepId) {
      setSteps((prev) =>
        prev.map((s) =>
          s.id === ev.stepId
            ? {
                ...s,
                liveGpuAvg: ev.gpuAvg ?? s.liveGpuAvg,
                liveGpuPeak: ev.gpuPeak ?? s.liveGpuPeak,
                liveMemAvg: ev.memAvg ?? s.liveMemAvg,
                liveMemPeak: ev.memPeak ?? s.liveMemPeak,
                gpuWarn: ev.gpuWarn ?? s.gpuWarn,
                gpuExpectedPeak: ev.gpuExpectedPeak ?? s.gpuExpectedPeak,
              }
            : s
        )
      )
    }
    if (ev.type === 'step_finished' && ev.stepId) {
      setStepClockStartedAt(null)
      if (ev.ok && !ev.cancelled) {
        const flushed = playwrightTrackerRef.current.flushPass()
        if (flushed) setLatestTestMarker(flushed)
      }
      if (ev.seconds != null) {
        setProgress((p) => ({ ...p, stepElapsed: ev.seconds! }))
      }
      setSteps((prev) =>
        prev.map((s) =>
          s.id === ev.stepId
            ? {
                ...s,
                status: ev.ok && !ev.cancelled ? 'ok' : 'fail',
                shortCircuit: ev.shortCircuit ?? s.shortCircuit,
                seconds: ev.seconds,
                gpuAvg: ev.gpuAvg ?? s.liveGpuAvg,
                gpuPeak: ev.gpuPeak ?? s.liveGpuPeak,
                memAvg: ev.memAvg,
                memPeak: ev.memPeak,
                memPressurePeak: ev.memPressurePeak,
                swapPeakGb: ev.swapPeakGb,
                startBd: ev.startBd ?? s.startBd,
                endBd: ev.endBd ?? s.endBd,
                liveGpuAvg: undefined,
                liveGpuPeak: undefined,
                liveMemAvg: undefined,
                liveMemPeak: undefined,
              }
            : s
        )
      )
    }
    if (ev.type === 'transcript_saved' && ev.path) {
      setTranscriptPath(ev.path)
    }
    if (ev.type === 'run_finished') {
      const finishedOk = !!ev.ok && !ev.cancelled
      setRunOk(finishedOk)
      setRunning(false)
      setRunClockStartedAt(null)
      setActiveRunId(null)
      const elapsedSeconds = ev.elapsedSeconds ?? 0
      const totalSeconds = ev.totalSeconds ?? 0
      const skipped = new Set(ev.skippedStepIds ?? [])
      setSteps((prev) => {
        const failedStepIds = prev.filter((s) => s.status === 'fail').map((s) => s.id)
        void maybeNotifySuiteRunFinished(ntfyPrefsRef.current, {
          ok: finishedOk,
          elapsedSeconds,
          totalSeconds,
          failedStepIds,
        })
        const next =
          skipped.size === 0
            ? prev
            : prev.map((s) =>
                skipped.has(s.id) && s.status === 'pending'
                  ? { ...s, status: 'skipped' as const }
                  : s
              )
        persistResumePoint(next, finishedOk, ev.cancelled)
        return next
      })
    }
    if (ev.type === 'error' && ev.text) {
      setError(ev.text)
    }
  }

  const handleCancel = async () => {
    setError(null)
    try {
      const id =
        activeRunId && activeRunId !== 'active' ? activeRunId : runId
      if (id) await cancelRun(id)
      await cancelActiveRun()
      try {
        const pre = await fetchPreflight()
        setActiveRunId(pre.activeRunInProgress ? pre.activeRunId ?? null : null)
        if (!pre.activeRunInProgress) setRunId(null)
      } catch {
        setActiveRunId(null)
        setRunId(null)
      }
      setRunning(false)
      setRunClockStartedAt(null)
    } catch (e) {
      setError(
        `Cancel failed — the suite may still be running in the background: ${(e as Error).message}`
      )
    }
  }

  const statusIcon = (step: StepState) => {
    if (step.status === 'ok') return <CheckCircleIcon color="success" fontSize="small" />
    if (step.status === 'fail') {
      if (step.shortCircuit) {
        return (
          <BoltIcon
            color="warning"
            fontSize="small"
            titleAccess="Short-circuited on test failure"
          />
        )
      }
      return <ErrorIcon color="error" fontSize="small" />
    }
    if (step.status === 'skipped') return <SkipNextIcon color="disabled" fontSize="small" />
    if (step.status === 'running') return <HourglassEmptyIcon color="primary" fontSize="small" />
    return <HourglassEmptyIcon color="disabled" fontSize="small" />
  }

  return (
    <Box sx={{ p: 2, width: '100%', boxSizing: 'border-box' }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        BrightVision Test Lab
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Engine self-test from repo root. Orchestrator on :{orchPort} — LAN proxy stays on :8742;
        main app chat on :8741. Default bar matches <code>yarn test:everything</code> (compact spec,
        1800s wall). Use <strong>Optional diagnostic lanes</strong> below for router, cloud API,
        EARS verify, scenario matrix, or strict phased pytest.
      </Typography>
      {repoRoot && (
        <Typography variant="caption" display="block" sx={{ mb: 1, wordBreak: 'break-all' }}>
          {repoRoot}
        </Typography>
      )}
      {captureMode && (
        <Alert severity={captureMode === 'bgpucap' ? 'info' : 'warning'} sx={{ mb: 2 }}>
          Capture: <strong>{captureMode}</strong>
          {captureNote ? ` — ${captureNote}` : ''}
        </Alert>
      )}
      {coreWarning && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Vision API on :8741 is in use. Integration/LLM steps may restart it and interrupt main
          BrightVision chat.
        </Alert>
      )}
      {activeRunId && !running && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          A suite run is still active on the orchestrator
          {activeRunId !== 'active' ? ` (${activeRunId.slice(0, 8)}…)` : ''}. Click{' '}
          <strong>Cancel</strong> to stop it, then run again.
        </Alert>
      )}
      {orchLoading && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Starting test orchestrator on :{orchPort}…
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {runOk === true && (
        <Alert severity="success" sx={{ mb: 2 }}>
          All test suites successful
        </Alert>
      )}
      {runOk === false && (
        <Alert severity="error" sx={{ mb: 2 }}>
          One or more steps failed
        </Alert>
      )}
      {transcriptPath && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Full transcript:{' '}
          <Box
            component="button"
            type="button"
            onClick={() => void handleRevealTranscript()}
            sx={{
              font: 'inherit',
              color: 'primary.main',
              textDecoration: 'underline',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              p: 0,
              wordBreak: 'break-all',
            }}
          >
            {transcriptPath}
          </Box>
          <Button size="small" sx={{ ml: 1 }} onClick={() => void handleCopyDigest()}>
            Copy agent digest
          </Button>
        </Alert>
      )}
      {digestMsg && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setDigestMsg(null)}>
          {digestMsg}
        </Alert>
      )}
      {ntfyMsg && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setNtfyMsg(null)}>
          {ntfyMsg}
        </Alert>
      )}
      <NtfyLabSettings
        prefs={ntfyPrefs}
        onChange={handleNtfyPrefsChange}
        onMessage={(message) => setNtfyMsg(message)}
      />
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Run options
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 1 }} flexWrap="wrap">
        <FormControlLabel
          control={
            <Checkbox
              checked={skipLlm}
              onChange={(_, v) => patchRunPrefs({ skipLlm: v })}
              disabled={running}
            />
          }
          label="Skip LLM tiers"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={skipGpu}
              onChange={(_, v) => patchRunPrefs({ skipGpu: v })}
              disabled={running}
            />
          }
          label="Skip GPU capture"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={failFast}
              onChange={(_, v) => patchRunPrefs({ failFast: v })}
              disabled={running}
            />
          }
          label="Fail fast (stop after first step failure)"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={shortCircuit}
              onChange={(_, v) => patchRunPrefs({ shortCircuit: v })}
              disabled={running}
            />
          }
          label="Short-circuit (abort on first test FAIL in output)"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={saveTranscript}
              onChange={(_, v) => patchRunPrefs({ saveTranscript: v })}
              disabled={running}
            />
          }
          label="Save full transcript to disk"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={useBrightDate}
              onChange={(_, v) => patchRunPrefs({ useBrightDate: v })}
              disabled={running || !btimeOnPath}
            />
          }
          label="BrightDate timings (BD / md ETC)"
        />
      </Stack>
      {!btimeOnPath && !running && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          BrightDate timings need <code>btime</code> on PATH (
          <a href="https://brightdate.org" target="_blank" rel="noopener noreferrer">
            brightdate.org
          </a>
          ).
        </Typography>
      )}
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Optional diagnostic lanes
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
        <FormControlLabel
          control={
            <Checkbox
              checked={specGenPhased}
              onChange={(_, v) => patchRunPrefs({ specGenPhased: v })}
              disabled={running || skipLlm}
            />
          }
          label="Phased spec-gen LLM (slow)"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={llmRouter}
              onChange={(_, v) => patchRunPrefs({ llmRouter: v })}
              disabled={running || skipLlm || !routerLaneReady}
            />
          }
          label="Model router e2e (slow)"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={cloudLlm}
              onChange={(_, v) => patchRunPrefs({ cloudLlm: v })}
              disabled={running || !cloudLlmConfigured}
            />
          }
          label="Cloud LLM smoke"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={verifyEars}
              onChange={(_, v) => patchRunPrefs({ verifyEars: v })}
              disabled={running}
            />
          }
          label="verify:ears"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={shippedScenarios}
              onChange={(_, v) => patchRunPrefs({ shippedScenarios: v })}
              disabled={running}
            />
          }
          label="Shipped scenario matrix"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={strictPhasedPytest}
              onChange={(_, v) => patchRunPrefs({ strictPhasedPytest: v })}
              disabled={running || skipLlm}
            />
          }
          label="Strict phased pytest (fail on EARS skip)"
        />
      </Stack>
      {cloudLlm && !cloudLlmConfigured && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Cloud LLM lane is checked but <code>cloud-llm.env</code> is missing or has no API key. Copy{' '}
          <code>cloud-llm.env.example</code> → <code>cloud-llm.env</code> before Run.
        </Alert>
      )}
      {!cloudLlmConfigured && !running && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          Cloud LLM smoke: add <code>cloud-llm.env</code> at repo root to enable the checkbox.
        </Typography>
      )}
      {!routerLaneReady && !running && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          Model router e2e: set <code>FAST_MODEL</code> and <code>HEAVY_MODEL</code> in{' '}
          <code>local-llm.env</code> (distinct tags). {routerLaneDetail}
        </Typography>
      )}
      {routerLaneReady && routerLaneDetail && !running && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
          Router lane: {routerLaneDetail}
        </Typography>
      )}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
        <Button
          variant="contained"
          onClick={() => void handleRun()}
          disabled={running || plan.length === 0 || !orchReady || orchLoading}
        >
          Run suite
        </Button>
        {resumeOffer && (
          <Button
            variant="contained"
            color="secondary"
            onClick={() => void handleRun(resumeOffer.startFromStepId)}
            disabled={running || !orchReady || orchLoading}
            title={`Skip steps before “${resumeOffer.startFromLabel}”`}
          >
            Resume from {resumeOffer.startFromLabel}
          </Button>
        )}
        <Button
          variant="outlined"
          onClick={handleCancel}
          disabled={!running && !activeRunId}
        >
          Cancel
        </Button>
        <Button
          variant="outlined"
          color="warning"
          onClick={() => void handleRestartOrchestrator()}
          disabled={orchLoading || running}
        >
          Restart orchestrator
        </Button>
      </Stack>
      {running && progress.total > 0 && (
        <Box sx={{ mb: 2 }}>
          <SuiteProgressTable
            stepIndex={progress.index}
            stepTotal={progress.total}
            stepElapsed={displayStepElapsed}
            stepStartedAtMs={stepClockStartedAt}
            etaTotal={etaTotal}
            runUseBrightDate={runUseBrightDate}
            suiteLeft={activeStepTiming?.runLeft}
            suiteFinishEtc={activeStepTiming?.runEtc}
            stepEtc={activeStepTiming?.stepEtc}
          />
          <LinearProgress variant={etaTotal > 0 ? 'determinate' : 'indeterminate'} value={pct} />
          {latestTestMarker && (
            <Chip
              size="small"
              icon={
                latestTestMarker.outcome === 'fail' ? (
                  <ErrorIcon />
                ) : latestTestMarker.outcome === 'pass' ? (
                  <CheckCircleIcon />
                ) : undefined
              }
              label={latestTestMarker.label}
              color={
                latestTestMarker.outcome === 'fail'
                  ? 'error'
                  : latestTestMarker.outcome === 'pass'
                    ? 'success'
                    : 'default'
              }
              variant="outlined"
              sx={{
                mt: 0.75,
                maxWidth: '100%',
                '& .MuiChip-icon': { ml: 0.5, mr: 1 },
                '& .MuiChip-label': { fontFamily: 'monospace' },
              }}
            />
          )}
        </Box>
      )}
      {steps.map((step, planIndex) => {
        const runningPlanIndex = steps.findIndex((s) => s.status === 'running')
        const timing = stepTimingLabels({
          status: step.status,
          planIndex,
          plan,
          steps,
          medians: stepMedians,
          running,
          runningPlanIndex,
          runningStepElapsed: displayStepElapsed,
          useBrightDate: runUseBrightDate,
          anchors: step.status === 'running' ? etcAnchors : null,
          etcPlan: runEtcPlan,
        })
        return (
        <Accordion
          key={step.id}
          defaultExpanded={step.status === 'running' || step.status === 'fail'}
          disableGutters
          sx={{
            mb: 0.5,
            '&:before': { display: 'none' },
            '& .MuiAccordionSummary-content': { my: 1, overflow: 'visible' },
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack spacing={0.75} sx={{ width: '100%', pr: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0, width: '100%' }}>
                {statusIcon(step)}
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                  {step.label}
                </Typography>
                {!running && plan.length > 0 && (
                  <IconButton
                    size="small"
                    aria-label={`Run from ${step.label}`}
                    title={`Run suite from “${step.label}” (earlier steps skipped)`}
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleRun(step.id)
                    }}
                  >
                    <PlayArrowIcon fontSize="small" />
                  </IconButton>
                )}
                <StepChipIcons planStep={plan.find((p) => p.id === step.id)} />
              </Stack>
              {(timing.eta ||
                timing.etc ||
                timing.runEtc ||
                step.seconds != null ||
                formatBdBounds(step.startBd, step.endBd) ||
                step.gpuAvg != null ||
                step.gpuPeak != null ||
                step.liveGpuPeak != null ||
                step.liveGpuAvg != null ||
                step.liveMemPeak != null ||
                step.memPeak != null ||
                (step.memPressurePeak != null && step.memPressurePeak >= 1) ||
                (step.swapPeakGb != null && step.swapPeakGb > 0.01)) && (
                <Stack direction="row" alignItems="center" spacing={0.75} useFlexGap flexWrap="wrap">
              {timing.eta && (
                <Chip size="small" label={timing.eta} variant="outlined" color="info" />
              )}
              {timing.etc && (
                <Chip size="small" label={timing.etc} variant="outlined" color="info" />
              )}
              {timing.runEtc && (
                <Chip size="small" label={timing.runEtc} variant="outlined" />
              )}
              {step.seconds != null && (
                <Chip
                  size="small"
                  label={
                    runUseBrightDate
                      ? fmtDurationBrightDate(step.seconds)
                      : fmtDuration(step.seconds)
                  }
                  variant="outlined"
                />
              )}
              {formatBdBounds(step.startBd, step.endBd) && (
                <Chip
                  size="small"
                  label={formatBdBounds(step.startBd, step.endBd)!}
                  variant="outlined"
                  title="Wall interval from btime / bgpucap (BrightDate)"
                />
              )}
              {(step.gpuAvg != null ||
                step.gpuPeak != null ||
                step.liveGpuPeak != null ||
                step.liveGpuAvg != null) && (
                <Chip
                  size="small"
                  label={`GPU ${Math.round(
                    step.gpuAvg ?? step.liveGpuAvg ?? step.liveGpuPeak ?? 0
                  )}% / ${Math.round(step.gpuPeak ?? step.liveGpuPeak ?? 0)}%${
                    step.gpuExpectedPeak != null
                      ? ` (hist ~${Math.round(step.gpuExpectedPeak)}%)`
                      : ''
                  }`}
                  color={
                    step.gpuWarn
                      ? 'error'
                      : (step.gpuPeak ?? step.liveGpuPeak ?? 0) >= 50
                        ? 'warning'
                        : 'default'
                  }
                  variant="outlined"
                  title={
                    step.gpuWarn
                      ? 'GPU usage is far below historical median for this step'
                      : undefined
                  }
                />
              )}
              {(step.memPeak != null || step.liveMemPeak != null) && (
                <Chip
                  size="small"
                  label={`RAM ${Math.round(step.memAvg ?? step.liveMemAvg ?? 0)}% / ${Math.round(step.memPeak ?? step.liveMemPeak ?? 0)}%`}
                  color={(step.memPeak ?? step.liveMemPeak ?? 0) >= 85 ? 'warning' : 'default'}
                  variant="outlined"
                />
              )}
              {step.memPressurePeak != null && step.memPressurePeak >= 1 && (
                <Chip
                  size="small"
                  label={`pressure ${step.memPressurePeak.toFixed(0)}`}
                  color={step.memPressurePeak >= 2 ? 'error' : 'warning'}
                  variant="outlined"
                />
              )}
              {step.swapPeakGb != null && step.swapPeakGb > 0.01 && (
                <Chip
                  size="small"
                  label={`swap ${step.swapPeakGb}G`}
                  color="warning"
                  variant="outlined"
                />
              )}
                </Stack>
              )}
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <StepLogPanel lines={step.lines} stepLabel={step.label} stepStatus={step.status} />
          </AccordionDetails>
        </Accordion>
        )
      })}
    </Box>
  )
}
