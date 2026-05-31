import { useCallback, useEffect, useMemo, useState } from 'react'
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
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import StepLogPanel from './StepLogPanel'
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
  startRun,
  streamRunEvents,
  waitForOrchestrator,
  type SuiteStepPlan,
  type TestSuiteEvent,
} from './testSuiteClient'
import { stepTimingLabels, type StepMedian } from './stepTiming'

type StepState = {
  id: string
  label: string
  status: 'pending' | 'running' | 'ok' | 'fail'
  lines: string[]
  seconds?: number
  gpuAvg?: number
  gpuPeak?: number
  /** Live samples from heartbeats while step is running */
  liveGpuAvg?: number
  liveGpuPeak?: number
}

export default function App() {
  const [skipLlm, setSkipLlm] = useState(false)
  const [skipGpu, setSkipGpu] = useState(false)
  const [saveTranscript, setSaveTranscript] = useState(false)
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
  const [error, setError] = useState<string | null>(null)
  const [runOk, setRunOk] = useState<boolean | null>(null)
  const [orchReady, setOrchReady] = useState(false)
  const [orchLoading, setOrchLoading] = useState(true)
  const [orchPort, setOrchPort] = useState(8743)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)

  const refreshMeta = useCallback(async () => {
    setOrchLoading(true)
    setError(null)
    try {
      clearSuiteBaseCache()
      await resolveSuiteBaseUrl(true)
      await waitForOrchestrator()
      setOrchReady(true)
      const [p, exp, pre] = await Promise.all([
        fetchPlan(skipLlm),
        fetchExpectations(skipLlm),
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
        }
      }
      setStepMedians(medMap)
      setCoreWarning(pre.corePortInUse)
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
  }, [skipLlm])

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

  const pct = useMemo(() => {
    if (!etaTotal || !progress.elapsed) return 0
    const done = progress.index - 1
    const prog = done >= 0 ? (done / progress.total) * etaTotal + progress.elapsed * 0.1 : progress.elapsed
    return Math.min(99, Math.round((prog / etaTotal) * 100))
  }, [etaTotal, progress])

  const handleRun = async () => {
    setError(null)
    setRunOk(null)
    setTranscriptPath(null)
    setRunning(true)
    setRunClockStartedAt(Date.now())
    setProgress({ index: 0, total: plan.length, elapsed: 0, stepElapsed: 0 })
    setSteps((prev) => prev.map((s) => ({ ...s, status: 'pending', lines: [] })))
    try {
      const { run_id, transcript_path } = await startRun({ skipLlm, skipGpu, saveTranscript })
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
    if (ev.type === 'progress') {
      setProgress((p) => ({
        index: ev.stepIndex || p.index,
        total: ev.totalSteps || p.total,
        elapsed: Math.max(p.elapsed, ev.elapsedSeconds || 0),
        stepElapsed: ev.stepElapsedSeconds ?? p.stepElapsed,
      }))
    }
    if (ev.type === 'step_started' && ev.stepId) {
      setProgress((p) => ({ ...p, stepElapsed: 0 }))
      setSteps((prev) =>
        prev.map((s) =>
          s.id === ev.stepId ? { ...s, status: 'running', lines: [] } : s
        )
      )
    }
    if (ev.type === 'step_line' && ev.stepId && ev.line) {
      const prefix = ev.stream === 'stderr' ? '[stderr] ' : ''
      setSteps((prev) =>
        prev.map((s) =>
          s.id === ev.stepId
            ? { ...s, lines: [...s.lines.slice(-400), prefix + ev.line!] }
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
              }
            : s
        )
      )
    }
    if (ev.type === 'step_finished' && ev.stepId) {
      setSteps((prev) =>
        prev.map((s) =>
          s.id === ev.stepId
            ? {
                ...s,
                status: ev.ok ? 'ok' : 'fail',
                seconds: ev.seconds,
                gpuAvg: ev.gpuAvg ?? s.liveGpuAvg,
                gpuPeak: ev.gpuPeak ?? s.liveGpuPeak,
                liveGpuAvg: undefined,
                liveGpuPeak: undefined,
              }
            : s
        )
      )
    }
    if (ev.type === 'transcript_saved' && ev.path) {
      setTranscriptPath(ev.path)
    }
    if (ev.type === 'run_finished') {
      setRunOk(!!ev.ok)
      setRunning(false)
      setRunClockStartedAt(null)
      setActiveRunId(null)
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
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
      setRunClockStartedAt(null)
    }
  }

  const statusIcon = (status: StepState['status']) => {
    if (status === 'ok') return <CheckCircleIcon color="success" fontSize="small" />
    if (status === 'fail') return <ErrorIcon color="error" fontSize="small" />
    if (status === 'running') return <HourglassEmptyIcon color="primary" fontSize="small" />
    return <HourglassEmptyIcon color="disabled" fontSize="small" />
  }

  return (
    <Box sx={{ p: 2, maxWidth: 960, mx: 'auto' }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        BrightVision Test Lab
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Engine self-test from repo root. Orchestrator on :{orchPort} — LAN proxy stays on :8742;
        main app chat on :8741.
      </Typography>
      {repoRoot && (
        <Typography variant="caption" display="block" sx={{ mb: 1, wordBreak: 'break-all' }}>
          {repoRoot}
        </Typography>
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
          Full transcript: {transcriptPath}
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
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
        <FormControlLabel
          control={<Checkbox checked={skipLlm} onChange={(_, v) => setSkipLlm(v)} disabled={running} />}
          label="Skip LLM tiers"
        />
        <FormControlLabel
          control={<Checkbox checked={skipGpu} onChange={(_, v) => setSkipGpu(v)} disabled={running} />}
          label="Skip GPU capture"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={saveTranscript}
              onChange={(_, v) => setSaveTranscript(v)}
              disabled={running}
            />
          }
          label="Save full transcript to disk"
        />
        <Button
          variant="contained"
          onClick={handleRun}
          disabled={running || plan.length === 0 || !orchReady || orchLoading}
        >
          Run suite
        </Button>
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
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
            <Typography variant="caption">
              Step {progress.index}/{progress.total}
            </Typography>
            <Typography variant="caption">
              {fmtDuration(progress.elapsed)}
              {progress.stepElapsed > 0
                ? ` (step ${fmtDuration(progress.stepElapsed)})`
                : ''}
              {etaTotal > 0 ? ` / ETA ~${fmtDuration(etaTotal)}` : ''}
            </Typography>
          </Stack>
          <LinearProgress variant={etaTotal > 0 ? 'determinate' : 'indeterminate'} value={pct} />
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
          runningStepElapsed: progress.stepElapsed,
        })
        return (
        <Accordion
          key={step.id}
          defaultExpanded={step.status === 'running' || step.status === 'fail'}
          disableGutters
          sx={{ mb: 0.5, '&:before': { display: 'none' } }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%', pr: 1 }}>
              {statusIcon(step.status)}
              <Typography variant="body2" sx={{ flex: 1 }}>
                {step.label}
              </Typography>
              {timing.eta && (
                <Chip size="small" label={timing.eta} variant="outlined" color="info" />
              )}
              {timing.etc && (
                <Chip size="small" label={timing.etc} variant="outlined" />
              )}
              {step.seconds != null && (
                <Chip size="small" label={fmtDuration(step.seconds)} variant="outlined" />
              )}
              {(step.gpuAvg != null ||
                step.gpuPeak != null ||
                step.liveGpuPeak != null) && (
                <Chip
                  size="small"
                  label={`GPU ${Math.round(
                    step.gpuAvg ?? step.liveGpuAvg ?? step.liveGpuPeak ?? 0
                  )}% / ${Math.round(step.gpuPeak ?? step.liveGpuPeak ?? 0)}%`}
                  color={
                    (step.gpuPeak ?? step.liveGpuPeak ?? 0) >= 50 ? 'warning' : 'default'
                  }
                  variant="outlined"
                />
              )}
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <StepLogPanel lines={step.lines} />
          </AccordionDetails>
        </Accordion>
        )
      })}
    </Box>
  )
}
