import type { Page } from '@playwright/test'
import type { TodoItem, TodoStore } from '../../src/todos/types'
import {
  confirmTurnEvents,
  defaultTurnEvents,
  E2E_SESSION_ID,
  emptyTodoStore,
} from './fixtures'
import { formatSse } from './sse'

export interface MockCoreOptions {
  sessionId?: string
  healthDelayMs?: number
  healthFail?: boolean
  healthFailCount?: number
  initialTodos?: TodoStore
  /** SSE event arrays per user message (cycles). */
  messageTurns?: Record<string, unknown>[][]
  /** Delay before fulfilling POST .../messages (keeps turn busy for queue/stop tests). */
  messageDelayMs?: number
  filesInChat?: string[]
  onSessionCreate?: (body: Record<string, unknown>) => void
}

function cloneStore(store: TodoStore): TodoStore {
  return JSON.parse(JSON.stringify(store)) as TodoStore
}

function newTodoId(): string {
  return `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function installMockCoreApi(page: Page, opts: MockCoreOptions = {}) {
  await page.unrouteAll({ behavior: 'ignoreErrors' })

  const sessionId = opts.sessionId ?? E2E_SESSION_ID
  const workspace = '.'
  let healthHits = 0
  let todoStore = cloneStore(opts.initialTodos ?? emptyTodoStore())
  let filesInChat = [...(opts.filesInChat ?? [])]
  let sessionAutoCommits = true
  let messageTurnIndex = 0
  const turns = opts.messageTurns ?? [defaultTurnEvents(), confirmTurnEvents()]

  const nextTurn = () => {
    const events = turns[messageTurnIndex % turns.length] ?? defaultTurnEvents()
    messageTurnIndex += 1
    return events
  }

  await page.route(
    (url) => url.pathname.endsWith('/health'),
    async (route) => {
    healthHits += 1
    if (opts.healthDelayMs) {
      await new Promise((r) => setTimeout(r, opts.healthDelayMs))
    }
    const failN = opts.healthFailCount ?? (opts.healthFail ? 999 : 0)
    if (healthHits <= failN) {
      await route.fulfill({ status: 503, body: 'unavailable' })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', auth_required: false }),
    })
    }
  )

  const sessionJson = () =>
    JSON.stringify({
      session_id: sessionId,
      workspace,
      model: 'test/model',
      files_in_chat: filesInChat,
    })

  await page.route('**/api/core/sessions', async (route) => {
    if (route.request().method() === 'POST') {
      try {
        const body = route.request().postDataJSON() as Record<string, unknown> & {
          auto_commits?: boolean
        }
        opts.onSessionCreate?.(body)
        if (typeof body?.auto_commits === 'boolean') {
          sessionAutoCommits = body.auto_commits
        }
      } catch {
        /* ignore */
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: sessionJson(),
      })
      return
    }
    await route.continue()
  })

  await page.route(`**/api/core/sessions/${sessionId}`, async (route) => {
    const method = route.request().method()
    if (method === 'DELETE') {
      await route.fulfill({ status: 204, body: '' })
      return
    }
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: sessionJson(),
      })
      return
    }
    await route.continue()
  })

  await page.route(`**/api/core/sessions/${sessionId}/commands`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        commands: [{ name: '/add', summary: 'Add files to chat' }],
      }),
    })
  })

  await page.route(`**/api/core/sessions/${sessionId}/messages`, async (route) => {
    if (opts.messageDelayMs) {
      await new Promise((r) => setTimeout(r, opts.messageDelayMs))
    }
    let events = nextTurn()
    try {
      const body = route.request().postDataJSON() as { content?: string }
      if (body?.content?.trim()) {
        events = [{ type: 'user_message', text: body.content.trim() }, ...events]
      }
    } catch {
      /* ignore */
    }
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      body: formatSse(events),
    })
  })

  await page.route(`**/api/core/sessions/${sessionId}/confirm`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.route(`**/api/core/sessions/${sessionId}/files`, async (route) => {
    try {
      const body = route.request().postDataJSON() as { paths?: string[] }
      if (body?.paths?.length) {
        filesInChat = [...new Set([...filesInChat, ...body.paths])]
      }
    } catch {
      /* ignore */
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ files_in_chat: filesInChat, events: [] }),
    })
  })

  await page.route(`**/api/core/sessions/${sessionId}/files/upload`, async (route) => {
    try {
      const body = route.request().postDataJSON() as {
        files?: { filename: string; content_base64: string }[]
      }
      const names = (body.files ?? []).map((f) => f.filename).filter(Boolean)
      if (names.length) {
        filesInChat = [...new Set([...filesInChat, ...names])]
      }
    } catch {
      /* ignore */
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ files_in_chat: filesInChat, events: [] }),
    })
  })

  const wsMatch = (url: URL) => {
    const ws = url.searchParams.get('workspace') ?? workspace
    return ws === workspace || ws === encodeURIComponent(workspace)
  }

  await page.route(
    (url) => /\/workspaces\/todos$/.test(url.pathname),
    async (route) => {
      const url = new URL(route.request().url())
      if (!wsMatch(url)) {
        await route.continue()
        return
      }
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(todoStore),
        })
        return
      }
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as {
          title?: string
          spec?: string
          template?: string
        }
        const now = new Date().toISOString()
        const item: TodoItem = {
          id: newTodoId(),
          title: body.title?.trim() || 'Untitled',
          spec: body.spec ?? '',
          requirements: body.template === 'spec-driven' ? '# Requirements\n' : '',
          design: '',
          tasks_md: '',
          depends_on: [],
          branch: '',
          pr_url: '',
          status: 'open',
          links: [],
          checklist: [],
          created_at: now,
          updated_at: now,
        }
        todoStore = {
          ...todoStore,
          todos: [...todoStore.todos, item],
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(item),
        })
        return
      }
      await route.continue()
    }
  )

  await page.route(
    (url) => url.pathname.endsWith('/workspaces/todos/active'),
    async (route) => {
      if (route.request().method() !== 'PUT') {
        await route.continue()
        return
      }
      const body = route.request().postDataJSON() as { activeId?: string | null }
      todoStore = { ...todoStore, activeId: body.activeId ?? null }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(todoStore),
      })
    }
  )

  await page.route(
    (url) => /\/workspaces\/todos\/[^/]+\/move$/.test(url.pathname),
    async (route) => {
    const url = new URL(route.request().url())
    const id = url.pathname.split('/').slice(-2)[0]!
    const body = route.request().postDataJSON() as { direction?: 'up' | 'down' }
    const idx = todoStore.todos.findIndex((t) => t.id === id)
    if (idx >= 0 && body.direction === 'up' && idx > 0) {
      const next = [...todoStore.todos]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      todoStore = { ...todoStore, todos: next }
    }
    if (idx >= 0 && body.direction === 'down' && idx < todoStore.todos.length - 1) {
      const next = [...todoStore.todos]
      ;[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]
      todoStore = { ...todoStore, todos: next }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(todoStore),
    })
    }
  )

  await page.route(
    (url) => /\/workspaces\/todos\/[^/]+\/generate-spec$/.test(url.pathname),
    async (route) => {
    const url = new URL(route.request().url())
    const id = url.pathname.split('/').slice(-2)[0]!
    const jobId = `job-${id}`
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ job_id: jobId }),
    })
    }
  )

  await page.route(
    (url) => /\/workspaces\/todos\/generate-spec\//.test(url.pathname),
    async (route) => {
    const url = new URL(route.request().url())
    const jobId = url.pathname.split('/').pop()!
    const todoId = jobId.replace(/^job-/, '')
    const idx = todoStore.todos.findIndex((t) => t.id === todoId)
    if (idx >= 0) {
      const t = todoStore.todos[idx]!
      const updated: TodoItem = {
        ...t,
        requirements: '# Generated requirements\n\nWHEN user acts THEN system SHALL respond.',
        design: '## Generated design\n\nDetails.',
        tasks_md: '- [ ] Generated step',
        updated_at: new Date().toISOString(),
      }
      const todos = [...todoStore.todos]
      todos[idx] = updated
      todoStore = { ...todoStore, todos }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'completed',
          requirements: updated.requirements,
          design: updated.design,
          tasks_md: updated.tasks_md,
          raw: '',
          item: updated,
        }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'completed', requirements: '', design: '', tasks_md: '', raw: '', item: null }),
    })
    }
  )

  await page.route(
    (url) => {
      const m = url.pathname.match(/\/workspaces\/todos\/([^/]+)$/)
      if (!m) return false
      const seg = m[1]
      return seg !== 'active' && !url.pathname.includes('generate-spec')
    },
    async (route) => {
    const url = new URL(route.request().url())
    const id = url.pathname.split('/').pop()!
    const method = route.request().method()

    if (method === 'PATCH') {
      const body = route.request().postDataJSON() as Partial<TodoItem>
      const idx = todoStore.todos.findIndex((t) => t.id === id)
      if (idx >= 0) {
        const prev = todoStore.todos[idx]!
        const item: TodoItem = {
          ...prev,
          ...body,
          id: prev.id,
          updated_at: new Date().toISOString(),
        }
        const todos = [...todoStore.todos]
        todos[idx] = item
        todoStore = { ...todoStore, todos }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ item, auto_completed: false }),
        })
        return
      }
    }

    if (method === 'DELETE') {
      todoStore = {
        ...todoStore,
        todos: todoStore.todos.filter((t) => t.id !== id),
        activeId: todoStore.activeId === id ? null : todoStore.activeId,
      }
      await route.fulfill({ status: 204, body: '' })
      return
    }

    await route.continue()
    }
  )

  return { sessionId, getAutoCommits: () => sessionAutoCommits, getTodoStore: () => todoStore }
}
