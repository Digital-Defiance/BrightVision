const DEFAULT_ORCH_PORT = '8743'

export type SuiteStepPlan = {
  id: string
  label: string
  requiresOllama: boolean
  touchesCorePort: boolean
}

export type TestSuiteEvent = {
  type: string
  stepId?: string
  label?: string
  stream?: string
  line?: string
  ok?: boolean
  seconds?: number
  gpuAvg?: number
  gpuPeak?: number
  cpuPct?: number
  gpuPct?: number
  stepIndex?: number
  totalSteps?: number
  elapsedSeconds?: number
  totalSeconds?: number
  stepElapsedSeconds?: number
  text?: string
  stepIds?: string[]
  repoRoot?: string
  path?: string
}

let resolvedBase: string | null = null

export function clearSuiteBaseCache(): void {
  resolvedBase = null
}

function friendlyNetError(err: unknown, url: string): Error {
  const raw = err instanceof Error ? err.message : String(err)
  if (raw === 'Load failed' || raw.includes('Failed to fetch') || raw.includes('NetworkError')) {
    return new Error(
      `Cannot reach test orchestrator at ${url} (${raw}). ` +
        'Click **Restart orchestrator** or quit Test Lab and run `pip install -e .` then `yarn test-lab:dev`.'
    )
  }
  return err instanceof Error ? err : new Error(raw)
}

function defaultBaseFromEnv(): string {
  if (import.meta.env.VITE_TEST_SUITE_URL) {
    return import.meta.env.VITE_TEST_SUITE_URL as string
  }
  const port = (import.meta.env.VITE_TEST_SUITE_PORT as string | undefined) || DEFAULT_ORCH_PORT
  return `http://127.0.0.1:${port}`
}

/** Resolve orchestrator URL (Tauri spawn port or VITE_TEST_SUITE_*). */
export async function resolveSuiteBaseUrl(force = false): Promise<string> {
  if (resolvedBase && !force) return resolvedBase
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    resolvedBase = await invoke<string>('get_suite_base_url')
    return resolvedBase
  } catch {
    resolvedBase = defaultBaseFromEnv()
    return resolvedBase
  }
}

export async function restartOrchestratorFromShell(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core')
  clearSuiteBaseCache()
  await invoke('restart_orchestrator')
}

export function suiteBaseUrl(): string {
  return resolvedBase ?? defaultBaseFromEnv()
}

/** Wait until the orchestrator answers /health (Tauri may start it on launch). */
export async function waitForOrchestrator(
  base?: string,
  maxAttempts = 80
): Promise<void> {
  const url = base ?? (await resolveSuiteBaseUrl())
  let lastErr = 'connection refused'
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) {
        const body = (await res.json()) as { service?: string; runsEnabled?: boolean }
        if (
          body.service === 'test-suite' &&
          body.runsEnabled === true &&
          body.cancelActiveRoute === true
        ) {
          return
        }
        if (body.service === 'test-suite' && body.runsEnabled === true) {
          lastErr = `orchestrator at ${url} is outdated (missing cancelActiveRoute). Restart Test Lab.`
        } else if (body.service === 'test-suite' && body.runsEnabled !== true) {
          lastErr = `orchestrator at ${url} is outdated (missing runsEnabled). Quit Test Lab and restart.`
        } else {
          lastErr = `unexpected health payload: ${JSON.stringify(body)}`
        }
      } else {
        lastErr = `health HTTP ${res.status}`
      }
    } catch (e) {
      lastErr = friendlyNetError(e, url).message
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(
    `Cannot reach test orchestrator at ${url} (${lastErr}). ` +
      'Ensure `source activate.sh && pip install -e .` then restart Test Lab, or run `yarn test-suite:serve`.'
  )
}

export async function fetchPlan(skipLlm: boolean): Promise<{ repoRoot: string; steps: SuiteStepPlan[] }> {
  const res = await fetch(`${suiteBaseUrl()}/test-suite/plan?skip_llm=${skipLlm ? 'true' : 'false'}`)
  if (!res.ok) throw new Error(`plan failed: ${res.status}`)
  return res.json()
}

export async function fetchExpectations(skipLlm: boolean) {
  const res = await fetch(
    `${suiteBaseUrl()}/test-suite/expectations?skip_llm=${skipLlm ? 'true' : 'false'}`
  )
  if (!res.ok) throw new Error(`expectations failed: ${res.status}`)
  return res.json() as Promise<{
    steps: Array<{ stepId: string; medianSeconds: number; sampleCount: number }>
    totalExpectedSeconds: number
    haveAllMedians: boolean
    missingMedians: string[]
  }>
}

export async function fetchPreflight() {
  const res = await fetch(`${suiteBaseUrl()}/test-suite/preflight`)
  if (!res.ok) throw new Error(`preflight failed: ${res.status}`)
  return res.json() as Promise<{
    repoRoot: string
    corePortInUse: boolean
    corePort: number
    orchestratorPort: number
    activeRunInProgress?: boolean
    activeRunId?: string | null
  }>
}

export async function fetchTranscriptDigest(
  transcriptPath: string,
  maxChars = 120_000
): Promise<{ digest: string; chars: number }> {
  const q = new URLSearchParams({
    path: transcriptPath,
    max_chars: String(maxChars),
    collapse_heartbeats: 'true',
  })
  const res = await fetch(`${suiteBaseUrl()}/test-suite/digest?${q}`)
  if (!res.ok) throw new Error(`digest failed: ${res.status}`)
  const body = (await res.json()) as { digest: string; chars: number }
  return { digest: body.digest, chars: body.chars }
}

export async function cancelActiveRun(): Promise<void> {
  const url = `${suiteBaseUrl()}/test-suite/runs/active/cancel`
  let res: Response
  try {
    res = await fetch(url, { method: 'POST' })
  } catch (e) {
    throw friendlyNetError(e, url)
  }
  if (res.status === 404) {
    let detail = ''
    try {
      const body = (await res.json()) as { detail?: string }
      detail = body.detail ?? ''
    } catch {
      /* ignore */
    }
    if (detail === 'No active run') return
    if (detail === 'Unknown run') {
      throw new Error(
        'Orchestrator on this port is outdated (Cancel route broken). Use **Restart orchestrator**.'
      )
    }
    return
  }
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { detail?: string }
      if (body.detail) detail = `: ${body.detail}`
    } catch {
      /* ignore */
    }
    throw new Error(`cancel active run failed: ${res.status}${detail}`)
  }
}

export async function startRun(opts: {
  skipLlm: boolean
  skipGpu: boolean
  saveTranscript?: boolean
}): Promise<{ run_id: string; transcript_path?: string | null }> {
  const res = await fetch(`${suiteBaseUrl()}/test-suite/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skip_llm: opts.skipLlm,
      skip_gpu: opts.skipGpu,
      skip_time: false,
      save_transcript: Boolean(opts.saveTranscript),
    }),
  })
  if (res.status === 409) throw new Error('A run is already in progress')
  if (!res.ok) {
    let detail = ''
    try {
      const errBody = (await res.json()) as { detail?: string }
      if (errBody.detail) detail = `: ${errBody.detail}`
    } catch {
      /* ignore */
    }
    throw new Error(`start run failed: ${res.status}${detail}`)
  }
  return res.json()
}

export async function cancelRun(runId: string): Promise<void> {
  const res = await fetch(`${suiteBaseUrl()}/test-suite/runs/${runId}/cancel`, {
    method: 'POST',
  })
  if (res.status === 404) return
  if (!res.ok) throw new Error(`cancel run failed: ${res.status}`)
}

export function streamRunEvents(
  runId: string,
  onEvent: (ev: TestSuiteEvent) => void,
  onDone: () => void,
  onError: (err: Error) => void
): () => void {
  const ac = new AbortController()
  ;(async () => {
    try {
      const res = await fetch(`${suiteBaseUrl()}/test-suite/runs/${runId}/events`, {
        signal: ac.signal,
      })
      if (!res.ok || !res.body) throw new Error(`SSE failed: ${res.status}`)
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() || ''
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue
            const payload = JSON.parse(line.slice(6)) as TestSuiteEvent
            onEvent(payload)
            if (payload.type === 'done') {
              onDone()
              return
            }
          }
        }
      }
      onDone()
    } catch (e) {
      if ((e as Error).name !== 'AbortError') onError(e as Error)
    }
  })()
  return () => ac.abort()
}

export function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec.toFixed(0)}s`
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm ? `${h}h ${rm}m` : `${h}h`
}
