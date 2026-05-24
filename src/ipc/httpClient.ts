/**
 * Browser / web-IDE client for aider-vision-core-serve (SSE).
 * Use when not running inside Tauri (e.g. Vite-only dev against core on :8741).
 */

import type { CoreEventBase } from './events'

const DEFAULT_BASE = 'http://127.0.0.1:8741'

export interface CoreSessionInfo {
  session_id: string
  workspace: string
  model: string
  files_in_chat: string[]
}

export class CoreHttpClient {
  readonly baseUrl: string

  constructor(
    baseUrl = DEFAULT_BASE,
    private token?: string
  ) {
    this.baseUrl = baseUrl
  }

  private headers(json = true): HeadersInit {
    const h: Record<string, string> = {}
    if (json) h['Content-Type'] = 'application/json'
    if (this.token) h['Authorization'] = `Bearer ${this.token}`
    return h
  }

  async health(): Promise<{ status: string; auth_required: boolean }> {
    const res = await fetch(`${this.baseUrl}/health`)
    if (!res.ok) throw new Error(`health: ${res.status}`)
    return res.json()
  }

  async undo(sessionId: string): Promise<{
    events: CoreEventBase[]
    commits: unknown
    last_commit_hash: string | null
  }> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/undo`, {
      method: 'POST',
      headers: this.headers(),
    })
    if (!res.ok) throw new Error(`undo: ${res.status}`)
    return res.json()
  }

  async listCommands(sessionId: string): Promise<{ name: string; summary: string }[]> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/commands`, {
      headers: this.headers(false),
    })
    if (!res.ok) throw new Error(`commands: ${res.status}`)
    const data = (await res.json()) as { commands: { name: string; summary: string }[] }
    return data.commands
  }

  async getSession(sessionId: string): Promise<CoreSessionInfo> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
      headers: this.headers(false),
    })
    if (!res.ok) throw new Error(`get session: ${res.status}`)
    return res.json()
  }

  async deleteSession(sessionId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: this.headers(false),
    })
    if (!res.ok) throw new Error(`delete session: ${res.status}`)
  }

  async createSession(body: {
    workspace: string
    files?: string[]
    model?: string
    stream?: boolean
  }): Promise<CoreSessionInfo> {
    const res = await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        stream: true,
        auto_commits: true,
        dirty_commits: true,
        dry_run: false,
        ...body,
      }),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  }

  /**
   * Stream message events via SSE. Yields parsed event dicts.
   */
  async *sendMessage(
    sessionId: string,
    content: string
  ): AsyncGenerator<CoreEventBase> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ content, preproc: true }),
    })
    if (!res.ok || !res.body) throw new Error(`message: ${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const emitParts = function* (parts: string[]) {
      for (const part of parts) {
        if (!part.trim()) continue
        for (const line of part.split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            yield JSON.parse(line.slice(6)) as CoreEventBase
          } catch {
            /* skip malformed SSE chunk */
          }
        }
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (value) {
        buffer += decoder.decode(value, { stream: true })
      }
      const parts = buffer.split('\n\n')
      if (done) {
        yield* emitParts(parts)
        break
      }
      buffer = parts.pop() ?? ''
      yield* emitParts(parts)
    }
  }
}
