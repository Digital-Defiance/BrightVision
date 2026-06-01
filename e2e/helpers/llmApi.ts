import { expect, type Page } from '@playwright/test'
import { parseSsePayload, type SseEvent } from './llmSse'
import { coreHealthUrl, resolveVisionModel } from './llmEnv'

const CORE_BASE = 'http://127.0.0.1:8741'

export type CoreSessionInfo = {
  sessionId: string
  filesInChat: string[]
}

export async function createCoreSession(
  workspace: string,
  opts?: { model?: string; files?: string[]; timeoutMs?: number }
): Promise<CoreSessionInfo> {
  const cap = opts?.timeoutMs ?? 600_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cap)
  try {
    const res = await fetch(`${CORE_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace,
        model: opts?.model || resolveVisionModel(),
        files: opts?.files ?? [],
        auto_yes: true,
      }),
      signal: controller.signal,
    })
    const text = await res.text()
    expect(res.ok, text).toBeTruthy()
    const body = JSON.parse(text) as { session_id?: string; files_in_chat?: string[] }
    expect(body.session_id).toBeTruthy()
    return {
      sessionId: body.session_id as string,
      filesInChat: body.files_in_chat ?? [],
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function streamSessionMessage(
  sessionId: string,
  content: string,
  opts?: { preproc?: boolean; timeoutMs?: number }
): Promise<SseEvent[]> {
  const cap = opts?.timeoutMs ?? 480_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cap)
  try {
    const res = await fetch(`${CORE_BASE}/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        preproc: opts?.preproc ?? true,
        active_todo_id: null,
        inject_todo_spec: false,
      }),
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`messages stream: ${res.status} ${text}`)
    }
    return parseSsePayload(text)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      try {
        await fetch(`${CORE_BASE}/sessions/${sessionId}/interrupt`, { method: 'POST' })
      } catch {
        /* best effort */
      }
      throw new Error(`SSE timed out after ${Math.floor(cap / 1000)}s`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export type TranscriptRow = { role: string; content: string }

export async function fetchSessionTranscript(sessionId: string): Promise<TranscriptRow[]> {
  const res = await fetch(`${CORE_BASE}/sessions/${sessionId}/transcript`)
  const text = await res.text()
  expect(res.ok, text).toBeTruthy()
  const body = JSON.parse(text) as { messages?: TranscriptRow[] }
  return body.messages ?? []
}

export async function assertCoreHealthOk() {
  const res = await fetch(coreHealthUrl())
  expect(res.ok).toBeTruthy()
  const body = (await res.json()) as { status?: string }
  expect(body.status).toBe('ok')
}

/** Capture session_id from POST /sessions when the UI starts a session. */
export async function captureSessionIdOnUiStart(page: Page, start: () => Promise<void>): Promise<string> {
  const responseP = page.waitForResponse(
    (r) =>
      r.url().includes('/sessions') &&
      r.request().method() === 'POST' &&
      r.status() === 200,
    { timeout: 120_000 }
  )
  await start()
  const response = await responseP
  const body = (await response.json()) as { session_id?: string }
  expect(body.session_id).toBeTruthy()
  return body.session_id as string
}
