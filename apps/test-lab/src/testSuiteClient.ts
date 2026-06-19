/**
 * Test Lab orchestrator client — Tauri resolves base URL; mobile uses TestSuiteClient directly.
 */
import {
  TestSuiteClient,
  fmtDuration,
  friendlyNetError,
  type SuiteLaneOptions,
  type SuiteStepPlan,
  type TestSuiteEvent,
} from '@brightvision/test-suite-client'

export type { SuiteLaneOptions, SuiteStepPlan, TestSuiteEvent }
export { fmtDuration, friendlyNetError }

const DEFAULT_ORCH_PORT = '8743'

let resolvedBase: string | null = null
let client: TestSuiteClient | null = null

export function clearSuiteBaseCache(): void {
  resolvedBase = null
  client = null
}

function defaultBaseFromEnv(): string {
  if (import.meta.env.VITE_TEST_SUITE_URL) {
    return import.meta.env.VITE_TEST_SUITE_URL as string
  }
  const port = (import.meta.env.VITE_TEST_SUITE_PORT as string | undefined) || DEFAULT_ORCH_PORT
  return `http://127.0.0.1:${port}`
}

export async function resolveSuiteBaseUrl(force = false): Promise<string> {
  if (resolvedBase && !force) return resolvedBase
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    resolvedBase = await invoke<string>('get_suite_base_url')
    client = new TestSuiteClient(resolvedBase)
    return resolvedBase
  } catch {
    resolvedBase = defaultBaseFromEnv()
    client = new TestSuiteClient(resolvedBase)
    return resolvedBase
  }
}

function getClient(): TestSuiteClient {
  if (!client) {
    client = new TestSuiteClient(resolvedBase ?? defaultBaseFromEnv())
  }
  return client
}

export async function restartOrchestratorFromShell(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core')
  clearSuiteBaseCache()
  await invoke('restart_orchestrator')
}

export function suiteBaseUrl(): string {
  return resolvedBase ?? defaultBaseFromEnv()
}

export async function waitForOrchestrator(base?: string, maxAttempts = 80): Promise<void> {
  if (base) {
    await new TestSuiteClient(base).waitForOrchestrator(maxAttempts)
    return
  }
  await resolveSuiteBaseUrl()
  await getClient().waitForOrchestrator(maxAttempts)
}

export async function fetchPlan(skipLlm: boolean, lanes: SuiteLaneOptions = {}) {
  await resolveSuiteBaseUrl()
  return getClient().fetchPlan(skipLlm, lanes)
}

export async function fetchExpectations(skipLlm: boolean, lanes: SuiteLaneOptions = {}) {
  const res = await fetch(
    `${suiteBaseUrl()}/test-suite/expectations?${new URLSearchParams({
      skip_llm: skipLlm ? 'true' : 'false',
      ...(lanes.specGenPhased ? { spec_gen_phased: 'true' } : {}),
      ...(lanes.llmRouter ? { llm_router: 'true' } : {}),
      ...(lanes.cloudLlm ? { cloud_llm: 'true' } : {}),
      ...(lanes.verifyEars ? { verify_ears: 'true' } : {}),
      ...(lanes.shippedScenarios ? { shipped_scenarios: 'true' } : {}),
      ...(lanes.strictPhasedPytest ? { strict_phased_pytest: 'true' } : {}),
      ...(lanes.implementAutoAdvanceLlm ? { implement_auto_advance_llm: 'true' } : {}),
    })}`
  )
  if (!res.ok) throw new Error(`expectations failed: ${res.status}`)
  return res.json() as Promise<{
    steps: Array<{
      stepId: string
      medianSeconds: number
      sampleCount: number
      medianGpuPeak?: number
      medianGpuAvg?: number
      gpuSampleCount?: number
    }>
    totalExpectedSeconds: number
    haveAllMedians: boolean
    missingMedians: string[]
  }>
}

export async function fetchPreflight() {
  await resolveSuiteBaseUrl()
  return getClient().fetchPreflight() as Promise<{
    repoRoot: string
    corePortInUse: boolean
    corePort: number
    orchestratorPort: number
    specGenPhasedEnv?: boolean
    cloudLlmConfigured?: boolean
    cloudLlmEnvFilePresent?: boolean
    routerLaneReady?: boolean
    routerLaneDetail?: string
    routerFastModel?: string | null
    routerHeavyModel?: string | null
    activeRunInProgress?: boolean
    activeRunId?: string | null
    btimeOnPath?: boolean
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
  if (res.status === 404) return
  if (!res.ok) throw new Error(`cancel active run failed: ${res.status}`)
}

export async function startRun(
  opts: {
    skipLlm: boolean
    skipGpu: boolean
    saveTranscript?: boolean
    useBrightDate?: boolean
    failFast?: boolean
    shortCircuit?: boolean
    startFromStepId?: string | null
  } & SuiteLaneOptions
): Promise<{ run_id: string; transcript_path?: string | null }> {
  const res = await fetch(`${suiteBaseUrl()}/test-suite/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skip_llm: opts.skipLlm,
      skip_gpu: opts.skipGpu,
      skip_time: false,
      use_brightdate: Boolean(opts.useBrightDate),
      spec_gen_phased: Boolean(opts.specGenPhased),
      llm_router: Boolean(opts.llmRouter),
      cloud_llm: Boolean(opts.cloudLlm),
      verify_ears: Boolean(opts.verifyEars),
      shipped_scenarios: Boolean(opts.shippedScenarios),
      strict_phased_pytest: Boolean(opts.strictPhasedPytest),
      implement_auto_advance_llm: Boolean(opts.implementAutoAdvanceLlm),
      save_transcript: Boolean(opts.saveTranscript),
      fail_fast: Boolean(opts.failFast),
      short_circuit: Boolean(opts.shortCircuit),
      start_from_step_id: opts.startFromStepId || null,
    }),
  })
  if (res.status === 409) throw new Error('A run is already in progress')
  if (!res.ok) throw new Error(`start run failed: ${res.status}`)
  return res.json()
}

export async function cancelRun(runId: string): Promise<void> {
  const res = await fetch(`${suiteBaseUrl()}/test-suite/runs/${runId}/cancel`, {
    method: 'POST',
  })
  if (res.status === 404) return
  if (!res.ok) throw new Error(`cancel run failed: ${res.status}`)
}

export async function revealPathInFinder(path: string): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('reveal_path_in_finder', { path })
    return
  } catch {
    /* not in Tauri */
  }
  throw new Error('Reveal in Finder is only available in the Test Lab desktop app')
}

export function streamRunEvents(
  runId: string,
  onEvent: (ev: TestSuiteEvent) => void,
  onDone: () => void,
  onError: (err: Error) => void
): () => void {
  return getClient().streamRunEvents(runId, onEvent, onDone, onError)
}
