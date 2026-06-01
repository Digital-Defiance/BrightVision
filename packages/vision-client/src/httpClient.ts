/**
 * Browser / web-IDE client for bright-vision-core-serve (SSE).
 * Use when not running inside Tauri (e.g. Vite-only dev against core on :8741).
 */

import type { EarsLintResult, SpecIndexResult, TraceabilityResult } from './todos/earsTypes'
import type { PatchTodoResult, TodoItem, TodoStore } from './todos/types'
import { normalizeStore, normalizeTodo } from './todos/storage'
import type { CoreEventBase } from './events'
import {
  readStreamChunkWithIdleTimeout,
  sseEventResetsIdleTimer,
} from './sseIdle'

export interface ModelRouterPoolEntryApi {
  model: string
  tier: 'fast' | 'heavy'
  enabled: boolean
  label?: string
}

export interface ModelRouterApiConfig {
  enabled: boolean
  fast_model: string
  heavy_model?: string
  model_pool?: ModelRouterPoolEntryApi[]
  token_fast_max?: number
  token_heavy_min?: number
  keep_alive_fast?: number | string
  keep_alive_heavy?: number | string
  escalate_on_failure?: boolean
}

export interface SendMessageOptions {
  activeTodoId?: string
  injectTodoSpec?: boolean
  specFocus?: boolean
  preproc?: boolean
  forceTier?: 'fast' | 'heavy'
  escalateFromLast?: boolean
}

export const DEFAULT_VISION_API_BASE = 'http://127.0.0.1:8741'
const DEFAULT_BASE = DEFAULT_VISION_API_BASE

export interface CoreSessionInfo {
  session_id: string
  workspace: string
  model: string
  files_in_chat: string[]
}

export interface SessionTranscriptRow {
  role: string
  content: string
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

  async health(signal?: AbortSignal): Promise<{
    status: string
    auth_required: boolean
    versions?: { bright_vision_core?: string; cecli?: string }
  }> {
    const res = await fetch(`${this.baseUrl}/health`, { signal })
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

  async listSubagents(sessionId: string): Promise<{
    subagents: { name: string; model: string | null; prompt_preview: string }[]
    agent_mode_available: boolean
  }> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/subagents`, {
      headers: this.headers(false),
    })
    if (!res.ok) throw new Error(`subagents: ${res.status}`)
    return res.json()
  }

  async getSession(sessionId: string): Promise<CoreSessionInfo> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
      headers: this.headers(false),
    })
    if (!res.ok) throw new Error(`get session: ${res.status}`)
    return res.json()
  }

  async getSessionTranscript(sessionId: string): Promise<SessionTranscriptRow[]> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/transcript`, {
      headers: this.headers(false),
    })
    if (!res.ok) throw new Error(`get session transcript: ${res.status}`)
    const data = (await res.json()) as { messages?: SessionTranscriptRow[] }
    return data.messages ?? []
  }

  /** Full session debug bundle (messages, tool calls, agent todo, recent events). */
  async fetchSessionDebugBlob(sessionId: string): Promise<Blob> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/debug`, {
      headers: this.headers(false),
    })
    if (!res.ok) {
      throw new Error(`session debug export: ${res.status} ${await res.text()}`)
    }
    return res.blob()
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
    model_router?: ModelRouterApiConfig
    stream?: boolean
    auto_yes?: boolean
    auto_commits?: boolean
    dirty_commits?: boolean
    dry_run?: boolean
    session_encrypt?: boolean
    auto_save?: boolean
    auto_load?: boolean
    auto_save_session_name?: string
    chat_history_file?: boolean
    spec_focus?: boolean
    session_mode?: 'vibe' | 'spec'
  }): Promise<CoreSessionInfo> {
    const res = await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        stream: true,
        auto_yes: false,
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
  async addSessionFiles(
    sessionId: string,
    paths: string[]
  ): Promise<{ files_in_chat: string[]; events: CoreEventBase[] }> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/files`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ paths }),
    })
    if (!res.ok) throw new Error(`add files: ${res.status} ${await res.text()}`)
    return res.json()
  }

  async uploadSessionFiles(
    sessionId: string,
    files: { filename: string; content_base64: string }[]
  ): Promise<{ files_in_chat: string[]; events: CoreEventBase[] }> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/files/upload`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ files }),
    })
    if (!res.ok) throw new Error(`upload files: ${res.status} ${await res.text()}`)
    return res.json()
  }

  async submitConfirm(sessionId: string, confirmId: string, answer: boolean): Promise<void> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/confirm`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ confirm_id: confirmId, answer }),
    })
    if (!res.ok) throw new Error(`confirm: ${res.status}`)
  }

  private workspaceQs(workspace: string): string {
    return `workspace=${encodeURIComponent(workspace)}`
  }

  async listWorkspaceTodos(workspace: string): Promise<TodoStore> {
    const res = await fetch(`${this.baseUrl}/workspaces/todos?${this.workspaceQs(workspace)}`, {
      headers: this.headers(false),
    })
    if (!res.ok) throw new Error(`workspace todos: ${res.status}`)
    return normalizeStore(await res.json())
  }

  /** Pull Cecli agent todo.txt into workspace Tasks when present. Returns null if none. */
  async importAgentTodoPlan(workspace: string): Promise<TodoStore | null> {
    const res = await fetch(
      `${this.baseUrl}/workspaces/todos/import-agent-plan?${this.workspaceQs(workspace)}`,
      { method: 'POST', headers: this.headers(false) }
    )
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`import agent todo plan: ${res.status} ${await res.text()}`)
    return normalizeStore(await res.json())
  }

  async createWorkspaceTodo(
    workspace: string,
    body: { title: string; spec?: string; template?: string }
  ): Promise<TodoItem> {
    const res = await fetch(`${this.baseUrl}/workspaces/todos?${this.workspaceQs(workspace)}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`create workspace todo: ${res.status} ${await res.text()}`)
    return (await res.json()) as TodoItem
  }

  async patchWorkspaceTodo(
    workspace: string,
    todoId: string,
    body: Partial<
      Pick<
        TodoItem,
        | 'title'
        | 'spec'
        | 'requirements'
        | 'design'
        | 'tasks_md'
        | 'depends_on'
        | 'branch'
        | 'pr_url'
        | 'status'
        | 'links'
        | 'checklist'
      >
    >
  ): Promise<PatchTodoResult> {
    const res = await fetch(
      `${this.baseUrl}/workspaces/todos/${todoId}?${this.workspaceQs(workspace)}`,
      {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify(body),
      }
    )
    if (!res.ok) throw new Error(`patch workspace todo: ${res.status} ${await res.text()}`)
    const data = (await res.json()) as PatchTodoResult
    return {
      item: normalizeTodo(data.item),
      auto_completed: Boolean(data.auto_completed),
      ears_requirements_ok: data.ears_requirements_ok ?? null,
      ears_error_count: data.ears_error_count ?? null,
    }
  }

  async deleteWorkspaceTodo(workspace: string, todoId: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/workspaces/todos/${todoId}?${this.workspaceQs(workspace)}`,
      { method: 'DELETE', headers: this.headers(false) }
    )
    if (!res.ok) throw new Error(`delete workspace todo: ${res.status}`)
  }

  async syncWorkspaceSpecFiles(workspace: string, todoId: string): Promise<TodoItem> {
    const res = await fetch(
      `${this.baseUrl}/workspaces/todos/${todoId}/sync-spec-files?${this.workspaceQs(workspace)}`,
      { method: 'POST', headers: this.headers(false) }
    )
    if (!res.ok) throw new Error(`sync spec files: ${res.status} ${await res.text()}`)
    return normalizeTodo(await res.json())
  }

  async exportWorkspaceSpecFiles(workspace: string, todoId: string): Promise<TodoItem> {
    const res = await fetch(
      `${this.baseUrl}/workspaces/todos/${todoId}/export-spec-files?${this.workspaceQs(workspace)}`,
      { method: 'POST', headers: this.headers(false) }
    )
    if (!res.ok) throw new Error(`export spec files: ${res.status} ${await res.text()}`)
    return normalizeTodo(await res.json())
  }

  async lintWorkspaceRequirements(
    workspace: string,
    todoId: string,
    draft?: { requirements?: string }
  ): Promise<EarsLintResult> {
    const res = await fetch(
      `${this.baseUrl}/workspaces/todos/${todoId}/lint-requirements?${this.workspaceQs(workspace)}`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(draft?.requirements != null ? { requirements: draft.requirements } : {}),
      }
    )
    if (!res.ok) throw new Error(`lint requirements: ${res.status} ${await res.text()}`)
    return (await res.json()) as EarsLintResult
  }

  async lintSessionRequirements(
    sessionId: string,
    todoId: string,
    draft?: { requirements?: string }
  ): Promise<EarsLintResult> {
    const res = await fetch(
      `${this.baseUrl}/sessions/${sessionId}/todos/${todoId}/lint-requirements`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(draft?.requirements != null ? { requirements: draft.requirements } : {}),
      }
    )
    if (!res.ok) throw new Error(`lint requirements: ${res.status} ${await res.text()}`)
    return (await res.json()) as EarsLintResult
  }

  async getWorkspaceSpecIndex(workspace: string): Promise<SpecIndexResult> {
    const res = await fetch(
      `${this.baseUrl}/workspaces/spec-index?${this.workspaceQs(workspace)}`,
      { headers: this.headers(false) }
    )
    if (!res.ok) throw new Error(`spec index: ${res.status} ${await res.text()}`)
    return (await res.json()) as SpecIndexResult
  }

  async repairWorkspaceSpecFolders(
    workspace: string
  ): Promise<{ created_count: number; created_ids: string[] }> {
    const res = await fetch(
      `${this.baseUrl}/workspaces/todos/repair-spec-folders?${this.workspaceQs(workspace)}`,
      { method: 'POST', headers: this.headers(false) }
    )
    if (!res.ok) throw new Error(`repair spec folders: ${res.status} ${await res.text()}`)
    return (await res.json()) as { created_count: number; created_ids: string[] }
  }

  async pruneOrphanWorkspaceSpecFolders(
    workspace: string
  ): Promise<{ removed_count: number; removed_ids: string[] }> {
    const res = await fetch(
      `${this.baseUrl}/workspaces/todos/prune-orphan-spec-folders?${this.workspaceQs(workspace)}`,
      { method: 'POST', headers: this.headers(false) }
    )
    if (!res.ok) throw new Error(`prune orphan spec folders: ${res.status} ${await res.text()}`)
    return (await res.json()) as { removed_count: number; removed_ids: string[] }
  }

  async getSessionSpecIndex(sessionId: string): Promise<SpecIndexResult> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/spec-index`, {
      headers: this.headers(false),
    })
    if (!res.ok) throw new Error(`spec index: ${res.status} ${await res.text()}`)
    return (await res.json()) as SpecIndexResult
  }

  async traceWorkspaceSpec(
    workspace: string,
    todoId: string,
    draft?: { requirements?: string; design?: string; tasks_md?: string }
  ): Promise<TraceabilityResult> {
    const body: Record<string, string> = {}
    if (draft?.requirements != null) body.requirements = draft.requirements
    if (draft?.design != null) body.design = draft.design
    if (draft?.tasks_md != null) body.tasks_md = draft.tasks_md
    const res = await fetch(
      `${this.baseUrl}/workspaces/todos/${todoId}/trace-spec?${this.workspaceQs(workspace)}`,
      { method: 'POST', headers: this.headers(), body: JSON.stringify(body) }
    )
    if (!res.ok) throw new Error(`trace spec: ${res.status} ${await res.text()}`)
    return (await res.json()) as TraceabilityResult
  }

  async traceSessionSpec(
    sessionId: string,
    todoId: string,
    draft?: { requirements?: string; design?: string; tasks_md?: string }
  ): Promise<TraceabilityResult> {
    const body: Record<string, string> = {}
    if (draft?.requirements != null) body.requirements = draft.requirements
    if (draft?.design != null) body.design = draft.design
    if (draft?.tasks_md != null) body.tasks_md = draft.tasks_md
    const res = await fetch(
      `${this.baseUrl}/sessions/${sessionId}/todos/${todoId}/trace-spec`,
      { method: 'POST', headers: this.headers(), body: JSON.stringify(body) }
    )
    if (!res.ok) throw new Error(`trace spec: ${res.status} ${await res.text()}`)
    return (await res.json()) as TraceabilityResult
  }

  async moveWorkspaceTodo(
    workspace: string,
    todoId: string,
    direction: 'up' | 'down'
  ): Promise<TodoStore> {
    const res = await fetch(
      `${this.baseUrl}/workspaces/todos/${todoId}/move?${this.workspaceQs(workspace)}`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ direction }),
      }
    )
    if (!res.ok) throw new Error(`move todo: ${res.status} ${await res.text()}`)
    return normalizeStore(await res.json())
  }

  async setActiveWorkspaceTodo(workspace: string, activeId: string | null): Promise<TodoStore> {
    const res = await fetch(
      `${this.baseUrl}/workspaces/todos/active?${this.workspaceQs(workspace)}`,
      {
        method: 'PUT',
        headers: this.headers(),
        body: JSON.stringify({ activeId }),
      }
    )
    if (!res.ok) throw new Error(`active workspace todo: ${res.status} ${await res.text()}`)
    return normalizeStore(await res.json())
  }

  async exportWorkspaceTodos(workspace: string): Promise<string> {
    const res = await fetch(
      `${this.baseUrl}/workspaces/todos/export?${this.workspaceQs(workspace)}`,
      { headers: this.headers(false) }
    )
    if (!res.ok) throw new Error(`export todos: ${res.status}`)
    return res.text()
  }

  async importWorkspaceTodos(
    workspace: string,
    markdown: string,
    merge: boolean
  ): Promise<TodoStore> {
    const res = await fetch(`${this.baseUrl}/workspaces/todos/import`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ workspace, markdown, merge }),
    })
    if (!res.ok) throw new Error(`import todos: ${res.status} ${await res.text()}`)
    return normalizeStore(await res.json())
  }

  /** @deprecated Prefer workspace-scoped methods */
  async listTodos(sessionId: string): Promise<TodoStore> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/todos`, {
      headers: this.headers(false),
    })
    if (!res.ok) throw new Error(`todos: ${res.status}`)
    return normalizeStore(await res.json())
  }

  async createTodo(
    sessionId: string,
    body: { title: string; spec?: string; template?: string }
  ): Promise<TodoItem> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/todos`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`create todo: ${res.status} ${await res.text()}`)
    return (await res.json()) as TodoItem
  }

  async patchTodo(
    sessionId: string,
    todoId: string,
    body: Partial<
      Pick<
        TodoItem,
        | 'title'
        | 'spec'
        | 'requirements'
        | 'design'
        | 'tasks_md'
        | 'depends_on'
        | 'branch'
        | 'pr_url'
        | 'status'
        | 'links'
        | 'checklist'
      >
    >
  ): Promise<PatchTodoResult> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/todos/${todoId}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`patch todo: ${res.status} ${await res.text()}`)
    const data = (await res.json()) as PatchTodoResult
    return {
      item: normalizeTodo(data.item),
      auto_completed: Boolean(data.auto_completed),
      ears_requirements_ok: data.ears_requirements_ok ?? null,
      ears_error_count: data.ears_error_count ?? null,
    }
  }

  async deleteTodo(sessionId: string, todoId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/todos/${todoId}`, {
      method: 'DELETE',
      headers: this.headers(false),
    })
    if (!res.ok) throw new Error(`delete todo: ${res.status}`)
  }

  private mapSpecJobResult(data: {
    requirements?: string
    design?: string
    tasks_md?: string
    raw?: string
    item?: TodoItem | null
    ears_blocked?: boolean
  }) {
    return {
      requirements: data.requirements ?? '',
      design: data.design ?? '',
      tasks_md: data.tasks_md ?? '',
      raw: data.raw ?? '',
      item: data.item ? normalizeTodo(data.item) : null,
      ears_blocked: Boolean(data.ears_blocked),
    }
  }

  /** Poll interval + max wait aligned with `LLM_SPEC_GEN_TIMEOUT_S` (Vite: `VITE_LLM_SPEC_GEN_TIMEOUT_S`). */
  private specGenPollMaxAttempts(): number {
    const meta =
      typeof import.meta !== 'undefined'
        ? (import.meta as ImportMeta & { env?: { VITE_LLM_SPEC_GEN_TIMEOUT_S?: string } }).env
            ?.VITE_LLM_SPEC_GEN_TIMEOUT_S
        : undefined
    const raw = meta || '1200'
    const sec = Number(raw)
    const cap = Number.isFinite(sec) && sec > 0 ? sec : 1200
    return Math.max(90, Math.ceil(cap * 1.05))
  }

  private async pollSpecGenerateJob(jobId: string, signal?: AbortSignal): Promise<{
    status: string
    error?: string | null
    requirements: string
    design: string
    tasks_md: string
    raw: string
    item: TodoItem | null
    ears_blocked?: boolean
  }> {
    const url = `${this.baseUrl}/workspaces/todos/generate-spec/${jobId}`
    const maxAttempts = this.specGenPollMaxAttempts()
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const res = await fetch(url, { headers: this.headers(false), signal })
      if (!res.ok) throw new Error(`spec job: ${res.status} ${await res.text()}`)
      const data = (await res.json()) as {
        status: string
        error?: string | null
        requirements?: string
        design?: string
        tasks_md?: string
        raw?: string
        item?: TodoItem | null
        ears_blocked?: boolean
      }
      if (data.status === 'completed') {
        return { status: data.status, ...this.mapSpecJobResult(data) }
      }
      if (data.status === 'error') {
        throw new Error(data.error || 'Spec generation failed')
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    throw new Error(
      `Spec generation timed out after ${maxAttempts}s (set VITE_LLM_SPEC_GEN_TIMEOUT_S / LLM_SPEC_GEN_TIMEOUT_S)`
    )
  }

  async generateWorkspaceTodoSpec(
    workspace: string,
    sessionId: string,
    todoId: string,
    body: {
      prompt: string
      mode?: 'generate' | 'refine'
      section?: 'all' | 'requirements' | 'design' | 'tasks_md'
      context_paths?: string[]
      apply?: boolean
      enforce_ears?: boolean
      background?: boolean
    },
    signal?: AbortSignal
  ): Promise<{
    requirements: string
    design: string
    tasks_md: string
    raw: string
    item: TodoItem | null
    ears_blocked?: boolean
  }> {
    const qs = `${this.workspaceQs(workspace)}&session_id=${encodeURIComponent(sessionId)}`
    const res = await fetch(`${this.baseUrl}/workspaces/todos/${todoId}/generate-spec?${qs}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        prompt: body.prompt,
        mode: body.mode ?? 'generate',
        section: body.section ?? 'all',
        context_paths: body.context_paths ?? [],
        apply: body.apply ?? true,
        enforce_ears: body.enforce_ears ?? true,
        background: body.background ?? true,
      }),
      signal,
    })
    if (res.status === 202) {
      const started = (await res.json()) as { job_id: string }
      const done = await this.pollSpecGenerateJob(started.job_id, signal)
      return {
        requirements: done.requirements,
        design: done.design,
        tasks_md: done.tasks_md,
        raw: done.raw,
        item: done.item,
        ears_blocked: done.ears_blocked,
      }
    }
    if (!res.ok) throw new Error(`generate spec: ${res.status} ${await res.text()}`)
    return this.mapSpecJobResult((await res.json()) as Record<string, unknown>)
  }

  async generateSessionTodoSpec(
    sessionId: string,
    todoId: string,
    body: {
      prompt: string
      mode?: 'generate' | 'refine'
      apply?: boolean
      enforce_ears?: boolean
      background?: boolean
    },
    signal?: AbortSignal
  ): Promise<{
    requirements: string
    design: string
    tasks_md: string
    raw: string
    item: TodoItem | null
    ears_blocked?: boolean
  }> {
    const res = await fetch(
      `${this.baseUrl}/sessions/${sessionId}/todos/${todoId}/generate-spec`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          prompt: body.prompt,
          mode: body.mode ?? 'generate',
          apply: body.apply ?? true,
          background: body.background ?? true,
        }),
        signal,
      }
    )
    if (res.status === 202) {
      const started = (await res.json()) as { job_id: string }
      const done = await this.pollSpecGenerateJob(started.job_id, signal)
      return {
        requirements: done.requirements,
        design: done.design,
        tasks_md: done.tasks_md,
        raw: done.raw,
        item: done.item,
        ears_blocked: done.ears_blocked,
      }
    }
    if (!res.ok) throw new Error(`generate spec: ${res.status} ${await res.text()}`)
    return this.mapSpecJobResult((await res.json()) as Record<string, unknown>)
  }

  async setActiveTodo(sessionId: string, activeId: string | null): Promise<TodoStore> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/todos/active`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify({ activeId }),
    })
    if (!res.ok) throw new Error(`active todo: ${res.status} ${await res.text()}`)
    return normalizeStore(await res.json())
  }

  async interruptTurn(sessionId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/interrupt`, {
      method: 'POST',
      headers: this.headers(false),
    })
    if (!res.ok) {
      const detail = await res.text()
      throw new Error(`interrupt turn: ${res.status} ${detail}`)
    }
  }

  async *sendMessage(
    sessionId: string,
    content: string,
    signal?: AbortSignal,
    options?: SendMessageOptions
  ): AsyncGenerator<CoreEventBase> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        content,
        preproc: options?.preproc ?? true,
        active_todo_id: options?.activeTodoId ?? null,
        inject_todo_spec: options?.injectTodoSpec ?? false,
        spec_focus: options?.specFocus ?? false,
        force_tier: options?.forceTier ?? null,
        escalate_from_last: options?.escalateFromLast ?? false,
      }),
      signal,
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

    let streamActivity = false
    try {
      while (true) {
        const { done, value } = await readStreamChunkWithIdleTimeout(
          reader,
          streamActivity
        )
        if (value) {
          buffer += decoder.decode(value, { stream: true })
        }
        const parts = buffer.split('\n\n')
        if (done) {
          for (const event of emitParts(parts)) {
            if (sseEventResetsIdleTimer(event)) streamActivity = true
            yield event
          }
          break
        }
        buffer = parts.pop() ?? ''
        for (const event of emitParts(parts)) {
          if (sseEventResetsIdleTimer(event)) streamActivity = true
          yield event
        }
      }
    } finally {
      try {
        reader.releaseLock()
      } catch {
        /* already released */
      }
    }
  }
}
