import { fmtDuration } from './duration'
import type { SuiteLaneOptions, SuiteStepPlan, TestSuiteEvent } from './types'

function laneQueryParams(skipLlm: boolean, lanes: SuiteLaneOptions): string {
  const q = new URLSearchParams()
  q.set('skip_llm', skipLlm ? 'true' : 'false')
  if (lanes.specGenPhased) q.set('spec_gen_phased', 'true')
  if (lanes.llmRouter) q.set('llm_router', 'true')
  if (lanes.cloudLlm) q.set('cloud_llm', 'true')
  if (lanes.verifyEars) q.set('verify_ears', 'true')
  if (lanes.shippedScenarios) q.set('shipped_scenarios', 'true')
  if (lanes.strictPhasedPytest) q.set('strict_phased_pytest', 'true')
  return q.toString()
}

function friendlyNetError(err: unknown, url: string): Error {
  const raw = err instanceof Error ? err.message : String(err)
  if (raw === 'Load failed' || raw.includes('Failed to fetch') || raw.includes('NetworkError')) {
    return new Error(`Cannot reach test orchestrator at ${url} (${raw})`)
  }
  return err instanceof Error ? err : new Error(raw)
}

export class TestSuiteClient {
  constructor(
    public readonly baseUrl: string,
    public readonly token?: string
  ) {}

  authHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra }
    const t = this.token?.trim()
    if (t) headers.Authorization = `Bearer ${t}`
    return headers
  }

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}${path}`
  }

  async health(): Promise<{ status: string; service?: string; runsEnabled?: boolean }> {
    const res = await fetch(this.url('/health'), { headers: this.authHeaders() })
    if (!res.ok) throw new Error(`health failed: ${res.status}`)
    return res.json()
  }

  async waitForOrchestrator(maxAttempts = 80): Promise<void> {
    const url = this.baseUrl
    let lastErr = 'connection refused'
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(this.url('/health'), {
          headers: this.authHeaders(),
          signal: AbortSignal.timeout(2000),
        })
        if (res.ok) {
          const body = (await res.json()) as {
            service?: string
            runsEnabled?: boolean
            cancelActiveRoute?: boolean
          }
          if (
            body.service === 'test-suite' &&
            body.runsEnabled === true &&
            body.cancelActiveRoute === true
          ) {
            return
          }
          lastErr = `unexpected health payload: ${JSON.stringify(body)}`
        } else {
          lastErr = `health HTTP ${res.status}`
        }
      } catch (e) {
        lastErr = friendlyNetError(e, url).message
      }
      await new Promise((r) => setTimeout(r, 400))
    }
    throw new Error(`Cannot reach test orchestrator at ${url} (${lastErr})`)
  }

  async fetchPlan(
    skipLlm: boolean,
    lanes: SuiteLaneOptions = {}
  ): Promise<{ repoRoot: string; steps: SuiteStepPlan[] }> {
    const res = await fetch(
      this.url(`/test-suite/plan?${laneQueryParams(skipLlm, lanes)}`),
      { headers: this.authHeaders() }
    )
    if (!res.ok) throw new Error(`plan failed: ${res.status}`)
    return res.json()
  }

  async fetchPreflight(): Promise<{
    repoRoot: string
    corePortInUse: boolean
    corePort: number
    orchestratorPort: number
    activeRunInProgress?: boolean
    activeRunId?: string | null
    btimeOnPath?: boolean
  }> {
    const res = await fetch(this.url('/test-suite/preflight'), { headers: this.authHeaders() })
    if (!res.ok) throw new Error(`preflight failed: ${res.status}`)
    return res.json()
  }

  async fetchRun(runId: string): Promise<{
    run_id: string
    status: string
    ok: boolean
    events: TestSuiteEvent[]
  }> {
    const res = await fetch(this.url(`/test-suite/runs/${runId}`), {
      headers: this.authHeaders(),
    })
    if (!res.ok) throw new Error(`run status failed: ${res.status}`)
    return res.json()
  }

  streamRunEvents(
    runId: string,
    onEvent: (ev: TestSuiteEvent) => void,
    onDone: () => void,
    onError: (err: Error) => void
  ): () => void {
    const ac = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(this.url(`/test-suite/runs/${runId}/events`), {
          signal: ac.signal,
          headers: this.authHeaders(),
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
}

export { fmtDuration, friendlyNetError, laneQueryParams }
