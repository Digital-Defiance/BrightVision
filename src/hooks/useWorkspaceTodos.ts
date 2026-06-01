import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CoreHttpClient } from '../ipc/httpClient'
import { isTauriRuntime } from '../ipc/isTauri'
import { loadTodoStore, normalizeTodo, saveTodoStore } from '../todos/storage'
import { exportTodoStore, importTodoStore } from '../todos/markdown'
import { applyLayerTemplate, applyTodoTemplate } from '../todos/templates'
import type { EarsLintResult, SpecIndexResult, TraceabilityResult } from '../todos/earsTypes'
import type { ChecklistItem, TodoItem, TodoStore, TodoStatus } from '../todos/types'

function nowIso(): string {
  return new Date().toISOString()
}

function checklistComplete(checklist: ChecklistItem[]): boolean {
  return checklist.length > 0 && checklist.every((c) => c.text.trim() && c.done)
}

export interface WorkspaceTodosApi {
  client: CoreHttpClient
  workspace: string
  sessionId?: string | null
}

type TodoPatch = Partial<
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

export type SpecLayerDraft = Partial<Pick<TodoItem, 'requirements' | 'design' | 'tasks_md'>>

function specLayersInPatch(patch: TodoPatch): SpecLayerDraft | null {
  const layers: SpecLayerDraft = {}
  if (patch.requirements !== undefined) layers.requirements = patch.requirements
  if (patch.design !== undefined) layers.design = patch.design
  if (patch.tasks_md !== undefined) layers.tasks_md = patch.tasks_md
  return Object.keys(layers).length > 0 ? layers : null
}

export function useWorkspaceTodos(
  workingDir: string,
  api?: WorkspaceTodosApi | null,
  callbacks?: {
    onAutoCompleted?: (todoId: string) => void
    onEarsRegression?: (todoId: string, errorCount: number) => void
    onSpecLayersSaved?: (todoId: string, layers: SpecLayerDraft) => void
  }
) {
  const onAutoCompleted = callbacks?.onAutoCompleted
  const onEarsRegression = callbacks?.onEarsRegression
  const onSpecLayersSaved = callbacks?.onSpecLayersSaved
  const [store, setStore] = useState<TodoStore | null>(null)
  const [loading, setLoading] = useState(true)
  const [httpReady, setHttpReady] = useState(false)
  const reloadGenerationRef = useRef(0)
  const tauriLocal = isTauriRuntime()

  const exportSpecToDisk = useCallback(
    async (id: string) => {
      if (httpReady && api) {
        await api.client.exportWorkspaceSpecFiles(api.workspace, id)
        return
      }
      if (tauriLocal) {
        await invoke('export_todo_spec_files', { workingDir, todoId: id })
      }
    },
    [httpReady, api, tauriLocal, workingDir]
  )

  const mirrorToDisk = useCallback(
    async (next: TodoStore) => {
      if (!tauriLocal) return
      await saveTodoStore(workingDir, next)
      if (!httpReady) {
        for (const t of next.todos) {
          await invoke('export_todo_spec_files', { workingDir, todoId: t.id })
        }
      }
    },
    [tauriLocal, workingDir, httpReady]
  )

  const persistLocal = useCallback(
    async (next: TodoStore) => {
      setStore(next)
      await mirrorToDisk(next)
    },
    [mirrorToDisk]
  )

  const reload = useCallback(async () => {
    const generation = ++reloadGenerationRef.current
    const stale = () => generation !== reloadGenerationRef.current
    setLoading(true)
    try {
      if (tauriLocal) {
        const local = await loadTodoStore(workingDir)
        if (!stale()) setStore(local)
      }
      if (api?.client) {
        try {
          await api.client.health()
          // Agent todo.txt sync runs on session create (cecli), not on every list —
          // re-import here resurrected tasks after delete.
          if (stale()) return
          const data = await api.client.listWorkspaceTodos(api.workspace)
          if (stale()) return
          setStore(data)
          setHttpReady(true)
          await mirrorToDisk(data)
          return
        } catch {
          if (!stale()) setHttpReady(false)
        }
      } else {
        setHttpReady(false)
      }
      if (!tauriLocal) {
        const local = await loadTodoStore(workingDir)
        if (!stale()) setStore(local)
      }
    } finally {
      if (!stale()) setLoading(false)
    }
  }, [api, workingDir, tauriLocal, mirrorToDisk])

  useEffect(() => {
    void reload()
  }, [reload])

  const activeTodo = useMemo(() => {
    if (!store?.activeId) return null
    return store.todos.find((t) => t.id === store.activeId) ?? null
  }, [store])

  const applyLocalAutoComplete = (
    id: string,
    patch: TodoPatch,
    todos: TodoItem[],
    activeId: string | null
  ): { todos: TodoItem[]; activeId: string | null; autoCompleted: boolean } => {
    if (!patch.checklist || !checklistComplete(patch.checklist)) {
      return { todos, activeId, autoCompleted: false }
    }
    const next = todos.map((t) => {
      if (t.id !== id || t.status === 'done' || t.status === 'cancelled') return t
      return { ...t, status: 'done' as const, updated_at: nowIso() }
    })
    const autoCompleted = next.some((t) => t.id === id && t.status === 'done')
    const nextActive = autoCompleted && activeId === id ? null : activeId
    if (autoCompleted) onAutoCompleted?.(id)
    return { todos: next, activeId: nextActive, autoCompleted }
  }

  const createTodo = useCallback(
    async (title: string, spec = '', template?: string) => {
      if (httpReady && api) {
        const created = await api.client.createWorkspaceTodo(api.workspace, {
          title,
          spec,
          template,
        })
        await reload()
        return normalizeTodo(created)
      }
      const layers = applyLayerTemplate(template)
      const item: TodoItem = layers
        ? {
            id: crypto.randomUUID().replace(/-/g, ''),
            title: title.trim() || 'Untitled',
            spec: '',
            requirements: layers.requirements,
            design: layers.design,
            tasks_md: layers.tasks_md,
            depends_on: [],
            branch: '',
            pr_url: '',
            status: 'open',
            links: [],
            checklist: [],
            created_at: nowIso(),
            updated_at: nowIso(),
          }
        : {
            id: crypto.randomUUID().replace(/-/g, ''),
            title: title.trim() || 'Untitled',
            spec: spec.trim() || applyTodoTemplate(template),
            requirements: '',
            design: '',
            tasks_md: '',
            depends_on: [],
            branch: '',
            pr_url: '',
            status: 'open',
            links: [],
            checklist: [],
            created_at: nowIso(),
            updated_at: nowIso(),
          }
      const base = store ?? { version: 1, activeId: null, todos: [] }
      await persistLocal({ ...base, todos: [item, ...base.todos] })
      if (layers) await exportSpecToDisk(item.id)
      return item
    },
    [httpReady, api, store, persistLocal, reload, exportSpecToDisk]
  )

  const updateTodo = useCallback(
    async (id: string, patch: TodoPatch) => {
      if (httpReady && api) {
        const result = await api.client.patchWorkspaceTodo(api.workspace, id, patch)
        if (result.auto_completed) onAutoCompleted?.(id)
        if (
          result.ears_requirements_ok === false &&
          (result.ears_error_count ?? 0) > 0
        ) {
          onEarsRegression?.(id, result.ears_error_count ?? 0)
        }
        const layers = specLayersInPatch(patch)
        if (layers) onSpecLayersSaved?.(id, layers)
        await reload()
        return result
      }
      if (!store) return
      let todos = store.todos.map((t) =>
        t.id === id ? { ...t, ...patch, updated_at: nowIso() } : t
      )
      let activeId = store.activeId
      const { todos: t2, activeId: a2, autoCompleted } = applyLocalAutoComplete(
        id,
        patch,
        todos,
        activeId
      )
      todos = t2
      activeId = a2
      if (!autoCompleted && patch.status === 'done' && activeId === id) {
        activeId = null
      }
      const layers = specLayersInPatch(patch)
      if (layers) onSpecLayersSaved?.(id, layers)
      await persistLocal({ ...store, todos, activeId })
      if (layers) await exportSpecToDisk(id)
    },
    [httpReady, api, store, persistLocal, reload, onAutoCompleted, onSpecLayersSaved, exportSpecToDisk]
  )

  const deleteTodo = useCallback(
    async (id: string) => {
      if (httpReady && api) {
        await api.client.deleteWorkspaceTodo(api.workspace, id)
        await reload()
        return
      }
      if (!store) return
      const todos = store.todos.filter((t) => t.id !== id)
      const activeId = store.activeId === id ? null : store.activeId
      await persistLocal({ ...store, todos, activeId })
      if (tauriLocal) {
        await invoke('delete_todo_spec_folder', { workingDir, todoId: id })
      }
    },
    [httpReady, api, store, persistLocal, reload, tauriLocal, workingDir]
  )

  const setActiveTodo = useCallback(
    async (id: string | null) => {
      if (httpReady && api) {
        const next = await api.client.setActiveWorkspaceTodo(api.workspace, id)
        setStore(next)
        await mirrorToDisk(next)
        return
      }
      if (!store) return
      let todos = store.todos
      if (id) {
        todos = todos.map((t) => {
          if (t.id !== id) return t
          const status: TodoStatus = t.status === 'open' ? 'in_progress' : t.status
          return { ...t, status, updated_at: nowIso() }
        })
      }
      await persistLocal({ ...store, activeId: id, todos })
    },
    [httpReady, api, store, persistLocal, mirrorToDisk]
  )

  const markDone = useCallback(
    async (id: string) => {
      await updateTodo(id, { status: 'done' })
      if (httpReady && api && store?.activeId === id) {
        const next = await api.client.setActiveWorkspaceTodo(api.workspace, null)
        setStore(next)
        await mirrorToDisk(next)
      } else if (store?.activeId === id) {
        await persistLocal({ ...store, activeId: null })
      }
    },
    [updateTodo, httpReady, api, store, persistLocal, mirrorToDisk]
  )

  const recordTurnLinks = useCallback(
    async (links: string[]) => {
      if (httpReady) return
      if (!store?.activeId || !links.length) return
      const todos = store.todos.map((t) => {
        if (t.id !== store.activeId) return t
        const seen = new Set(t.links)
        const merged = [...t.links]
        for (const link of links) {
          const s = link.trim()
          if (s && !seen.has(s)) {
            merged.push(s)
            seen.add(s)
          }
        }
        return { ...t, links: merged, updated_at: nowIso() }
      })
      await persistLocal({ ...store, todos })
    },
    [httpReady, store, persistLocal]
  )

  const syncSpecFromDisk = useCallback(
    async (id: string) => {
      const importFromDisk = async () => {
        if (httpReady && api) {
          await api.client.syncWorkspaceSpecFiles(api.workspace, id)
          return
        }
        if (tauriLocal) {
          await invoke('import_todo_spec_files', { workingDir, todoId: id })
          return
        }
        throw new Error('Sync from disk requires the desktop app or a running Vision API session')
      }
      try {
        await importFromDisk()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const missingOnDisk =
          /empty|No spec folder|Spec folder has no|404/.test(msg) ||
          msg.includes('not found')
        if (!missingOnDisk) throw err
        await exportSpecToDisk(id)
        await importFromDisk()
      }
      await reload()
    },
    [httpReady, api, tauriLocal, workingDir, reload, exportSpecToDisk]
  )

  const lintRequirements = useCallback(
    async (id: string, draftRequirements?: string): Promise<EarsLintResult> => {
      if (!httpReady || !api) {
        throw new Error('Validate EARS requires a running Vision API session (Terminal → Start)')
      }
      const draft =
        draftRequirements !== undefined ? { requirements: draftRequirements } : undefined
      if (api.sessionId) {
        return api.client.lintSessionRequirements(api.sessionId, id, draft)
      }
      return api.client.lintWorkspaceRequirements(api.workspace, id, draft)
    },
    [httpReady, api]
  )

  const fetchSpecIndex = useCallback(async (): Promise<SpecIndexResult> => {
    if (!httpReady || !api) {
      throw new Error('Spec index requires a running Vision API (Terminal → Start)')
    }
    if (api.sessionId) {
      return api.client.getSessionSpecIndex(api.sessionId)
    }
    return api.client.getWorkspaceSpecIndex(api.workspace)
  }, [httpReady, api])

  const repairSpecFolders = useCallback(async (): Promise<{ created_count: number; created_ids: string[] }> => {
    if (!httpReady || !api) {
      throw new Error('Repair spec folders requires a running Vision API')
    }
    return api.client.repairWorkspaceSpecFolders(api.workspace)
  }, [httpReady, api])

  const pruneOrphanSpecFolders = useCallback(async (): Promise<{ removed_count: number; removed_ids: string[] }> => {
    if (httpReady && api) {
      return api.client.pruneOrphanWorkspaceSpecFolders(api.workspace)
    }
    if (tauriLocal) {
      const removed_ids = await invoke<string[]>('prune_orphan_spec_folders', { workingDir })
      return { removed_count: removed_ids.length, removed_ids }
    }
    throw new Error('Remove orphan spec folders requires the desktop app or a running Vision API')
  }, [httpReady, api, tauriLocal, workingDir])

  const traceSpec = useCallback(
    async (
      id: string,
      draft?: { requirements?: string; design?: string; tasks_md?: string }
    ): Promise<TraceabilityResult> => {
      if (!httpReady || !api) {
        throw new Error('Trace coverage requires a running Vision API (Terminal → Start)')
      }
      if (api.sessionId) {
        return api.client.traceSessionSpec(api.sessionId, id, draft)
      }
      return api.client.traceWorkspaceSpec(api.workspace, id, draft)
    },
    [httpReady, api]
  )

  const moveTodo = useCallback(
    async (id: string, direction: 'up' | 'down') => {
      if (httpReady && api) {
        const next = await api.client.moveWorkspaceTodo(api.workspace, id, direction)
        setStore(next)
        await mirrorToDisk(next)
        return
      }
      if (!store) return
      const idx = store.todos.findIndex((t) => t.id === id)
      if (idx < 0) return
      const newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= store.todos.length) return
      const todos = [...store.todos]
      ;[todos[idx], todos[newIdx]] = [todos[newIdx], todos[idx]]
      await persistLocal({ ...store, todos })
    },
    [httpReady, api, store, persistLocal, mirrorToDisk]
  )

  const importMarkdown = useCallback(
    async (markdown: string, merge: boolean) => {
      if (httpReady && api) {
        const next = await api.client.importWorkspaceTodos(api.workspace, markdown, merge)
        setStore(next)
        await mirrorToDisk(next)
        return
      }
      const base = store ?? (await loadTodoStore(workingDir))
      const next = importTodoStore(markdown, base, merge)
      await persistLocal(next)
    },
    [httpReady, api, store, workingDir, persistLocal, mirrorToDisk]
  )

  const exportMarkdown = useCallback(async (): Promise<string> => {
    if (httpReady && api) {
      return api.client.exportWorkspaceTodos(api.workspace)
    }
    const local = store ?? (await loadTodoStore(workingDir))
    return exportTodoStore(local)
  }, [httpReady, api, store, workingDir])

  return {
    store,
    loading,
    httpReady,
    tauriLocal,
    activeTodo,
    reload,
    createTodo,
    updateTodo,
    deleteTodo,
    setActiveTodo,
    markDone,
    recordTurnLinks,
    exportMarkdown,
    importMarkdown,
    moveTodo,
    syncSpecFromDisk,
    exportSpecToDisk,
    lintRequirements,
    fetchSpecIndex,
    traceSpec,
    repairSpecFolders,
    pruneOrphanSpecFolders,
  }
}
