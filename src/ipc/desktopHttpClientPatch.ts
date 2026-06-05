/**
 * Route mutating Vision API calls through Tauri/reqwest on desktop (WebKit fetch POST often fails).
 */
import type {
  CoreHttpClient,
  EarsLintResult,
  PatchTodoResult,
  TodoItem,
  TodoStore,
  TraceabilityResult,
} from '@brightvision/vision-client'
import { normalizeStore, normalizeTodo } from '@brightvision/vision-client'
import {
  desktopVisionFetchBlob,
  desktopVisionFetchRaw,
  desktopVisionRequest,
} from './desktopVisionApi'

function workspaceQs(workspace: string): string {
  return `workspace=${encodeURIComponent(workspace)}`
}

function mapSpecJobResult(data: {
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

function specGenPollMaxAttempts(): number {
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

export function patchCoreHttpClientForTauri(
  client: CoreHttpClient,
  token?: string
): CoreHttpClient {
  const base = client.baseUrl

  const req = <T>(method: string, path: string, body?: unknown) =>
    desktopVisionRequest<T>(method, base, path, token, body)

  client.undo = (sessionId) =>
    req('POST', `sessions/${sessionId}/undo`)

  client.deleteSession = async (sessionId) => {
    await req('DELETE', `sessions/${sessionId}`)
  }

  client.addSessionFiles = (sessionId, paths) =>
    req('POST', `sessions/${sessionId}/files`, { paths })

  client.uploadSessionFiles = (sessionId, files) =>
    req('POST', `sessions/${sessionId}/files/upload`, { files })

  client.submitConfirm = (sessionId, confirmId, answer) =>
    req('POST', `sessions/${sessionId}/confirm`, {
      confirm_id: confirmId,
      answer,
    }).then(() => undefined)

  client.importAgentTodoPlan = async (workspace) => {
    const path = `workspaces/todos/import-agent-plan?${workspaceQs(workspace)}`
    const { status, body } = await desktopVisionFetchRaw('POST', base, path, token)
    if (status === 404) return null
    if (status < 200 || status >= 300) {
      throw new Error(`import agent todo plan: ${status}`)
    }
    return normalizeStore(body)
  }

  client.importSessionAgentTodoPlan = (sessionId) =>
    req<TodoStore>('POST', `sessions/${encodeURIComponent(sessionId)}/todos/import-agent-plan`).then(
      normalizeStore
    )

  client.createWorkspaceTodo = (workspace, body) =>
    req<TodoItem>('POST', `workspaces/todos?${workspaceQs(workspace)}`, body)

  client.patchWorkspaceTodo = async (workspace, todoId, body) => {
    const data = await req<PatchTodoResult>(
      'PATCH',
      `workspaces/todos/${todoId}?${workspaceQs(workspace)}`,
      body
    )
    return {
      item: normalizeTodo(data.item),
      auto_completed: Boolean(data.auto_completed),
      ears_requirements_ok: data.ears_requirements_ok ?? null,
      ears_error_count: data.ears_error_count ?? null,
    }
  }

  client.deleteWorkspaceTodo = (workspace, todoId) =>
    req('DELETE', `workspaces/todos/${todoId}?${workspaceQs(workspace)}`).then(() => undefined)

  client.syncWorkspaceSpecFiles = (workspace, todoId) =>
    req<TodoItem>(
      'POST',
      `workspaces/todos/${todoId}/sync-spec-files?${workspaceQs(workspace)}`
    ).then(normalizeTodo)

  client.exportWorkspaceSpecFiles = (workspace, todoId) =>
    req<TodoItem>(
      'POST',
      `workspaces/todos/${todoId}/export-spec-files?${workspaceQs(workspace)}`
    ).then(normalizeTodo)

  client.lintWorkspaceRequirements = (workspace, todoId, draft) =>
    req<EarsLintResult>(
      'POST',
      `workspaces/todos/${todoId}/lint-requirements?${workspaceQs(workspace)}`,
      draft?.requirements != null ? { requirements: draft.requirements } : {}
    )

  client.lintSessionRequirements = (sessionId, todoId, draft) =>
    req<EarsLintResult>(
      'POST',
      `sessions/${sessionId}/todos/${todoId}/lint-requirements`,
      draft?.requirements != null ? { requirements: draft.requirements } : {}
    )

  client.repairWorkspaceSpecFolders = (workspace) =>
    req<{ created_count: number; created_ids: string[] }>(
      'POST',
      `workspaces/todos/repair-spec-folders?${workspaceQs(workspace)}`
    )

  client.pruneOrphanWorkspaceSpecFolders = (workspace) =>
    req<{ removed_count: number; removed_ids: string[] }>(
      'POST',
      `workspaces/todos/prune-orphan-spec-folders?${workspaceQs(workspace)}`
    )

  client.traceWorkspaceSpec = (workspace, todoId, draft) => {
    const body: Record<string, string> = {}
    if (draft?.requirements != null) body.requirements = draft.requirements
    if (draft?.design != null) body.design = draft.design
    if (draft?.tasks_md != null) body.tasks_md = draft.tasks_md
    return req<TraceabilityResult>(
      'POST',
      `workspaces/todos/${todoId}/trace-spec?${workspaceQs(workspace)}`,
      body
    )
  }

  client.traceSessionSpec = (sessionId, todoId, draft) => {
    const body: Record<string, string> = {}
    if (draft?.requirements != null) body.requirements = draft.requirements
    if (draft?.design != null) body.design = draft.design
    if (draft?.tasks_md != null) body.tasks_md = draft.tasks_md
    return req<TraceabilityResult>(
      'POST',
      `sessions/${sessionId}/todos/${todoId}/trace-spec`,
      body
    )
  }

  client.moveWorkspaceTodo = (workspace, todoId, direction) =>
    req<TodoStore>('POST', `workspaces/todos/${todoId}/move?${workspaceQs(workspace)}`, {
      direction,
    }).then(normalizeStore)

  client.setActiveWorkspaceTodo = (workspace, activeId) =>
    req<TodoStore>('PUT', `workspaces/todos/active?${workspaceQs(workspace)}`, { activeId }).then(
      normalizeStore
    )

  client.importWorkspaceTodos = (workspace, markdown, merge) =>
    req<TodoStore>('POST', 'workspaces/todos/import', { workspace, markdown, merge }).then(
      normalizeStore
    )

  client.createTodo = (sessionId, body) =>
    req<TodoItem>('POST', `sessions/${sessionId}/todos`, body)

  client.patchTodo = async (sessionId, todoId, body) => {
    const data = await req<PatchTodoResult>('PATCH', `sessions/${sessionId}/todos/${todoId}`, body)
    return {
      item: normalizeTodo(data.item),
      auto_completed: Boolean(data.auto_completed),
      ears_requirements_ok: data.ears_requirements_ok ?? null,
      ears_error_count: data.ears_error_count ?? null,
    }
  }

  client.deleteTodo = (sessionId, todoId) =>
    req('DELETE', `sessions/${sessionId}/todos/${todoId}`).then(() => undefined)

  client.setActiveTodo = (sessionId, activeId) =>
    req<TodoStore>('PUT', `sessions/${sessionId}/todos/active`, { activeId }).then(normalizeStore)

  client.interruptTurn = (sessionId) =>
    req('POST', `sessions/${sessionId}/interrupt`).then(() => undefined)

  client.fetchSessionDebugBlob = (sessionId) =>
    desktopVisionFetchBlob(
      'GET',
      base,
      `sessions/${sessionId}/debug`,
      token,
      'application/json'
    )

  client.fetchSpecJobDebugBlob = (jobId) =>
    desktopVisionFetchBlob(
      'GET',
      base,
      `workspaces/todos/generate-spec/${jobId}/debug`,
      token,
      'application/json'
    )

  const pollSpecGenerateJob = async (
    jobId: string,
    signal?: AbortSignal
  ): Promise<{
    status: string
    error?: string | null
    requirements: string
    design: string
    tasks_md: string
    raw: string
    item: TodoItem | null
    ears_blocked?: boolean
  }> => {
    const path = `workspaces/todos/generate-spec/${jobId}`
    const maxAttempts = specGenPollMaxAttempts()
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const data = await req<{
        status: string
        error?: string | null
        requirements?: string
        design?: string
        tasks_md?: string
        raw?: string
        item?: TodoItem | null
        ears_blocked?: boolean
      }>('GET', path)
      if (data.status === 'completed') {
        return { status: data.status, ...mapSpecJobResult(data) }
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

  client.generateWorkspaceTodoSpec = async (
    workspace,
    sessionId,
    todoId,
    body,
    signal,
    hooks
  ) => {
    const qs = `${workspaceQs(workspace)}&session_id=${encodeURIComponent(sessionId)}`
    const payload = {
      prompt: body.prompt,
      mode: body.mode ?? 'generate',
      section: body.section ?? 'all',
      context_paths: body.context_paths ?? [],
      apply: body.apply ?? true,
      enforce_ears: body.enforce_ears ?? true,
      background: body.background ?? true,
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const { status, body: resBody } = await desktopVisionFetchRaw(
      'POST',
      base,
      `workspaces/todos/${todoId}/generate-spec?${qs}`,
      token,
      payload
    )
    if (status === 202) {
      const started = resBody as { job_id: string }
      hooks?.onJobStarted?.(started.job_id)
      const done = await pollSpecGenerateJob(started.job_id, signal)
      return {
        requirements: done.requirements,
        design: done.design,
        tasks_md: done.tasks_md,
        raw: done.raw,
        item: done.item,
        ears_blocked: done.ears_blocked,
      }
    }
    if (status < 200 || status >= 300) {
      throw new Error(`generate spec: ${status}`)
    }
    return mapSpecJobResult(resBody as Record<string, unknown>)
  }

  client.generateSessionTodoSpec = async (sessionId, todoId, body, signal, hooks) => {
    const payload = {
      prompt: body.prompt,
      mode: body.mode ?? 'generate',
      apply: body.apply ?? true,
      background: body.background ?? true,
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const { status, body: resBody } = await desktopVisionFetchRaw(
      'POST',
      base,
      `sessions/${sessionId}/todos/${todoId}/generate-spec`,
      token,
      payload
    )
    if (status === 202) {
      const started = resBody as { job_id: string }
      hooks?.onJobStarted?.(started.job_id)
      const done = await pollSpecGenerateJob(started.job_id, signal)
      return {
        requirements: done.requirements,
        design: done.design,
        tasks_md: done.tasks_md,
        raw: done.raw,
        item: done.item,
        ears_blocked: done.ears_blocked,
      }
    }
    if (status < 200 || status >= 300) {
      throw new Error(`generate spec: ${status}`)
    }
    return mapSpecJobResult(resBody as Record<string, unknown>)
  }

  return client
}
