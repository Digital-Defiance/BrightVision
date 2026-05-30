import type { ChecklistItem, TodoItem, TodoStore } from './types'
import { EMPTY_TODO_STORE } from './types'

function migrateTodoLayers(todo: TodoItem): TodoItem {
  if (
    todo.spec.trim() &&
    !todo.requirements.trim() &&
    !todo.design.trim() &&
    !todo.tasks_md.trim()
  ) {
    return { ...todo, requirements: todo.spec.trim() }
  }
  return todo
}

function normalizeChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map((c) => {
    const row = c as Record<string, unknown>
    return {
      id: String(row.id ?? crypto.randomUUID().replace(/-/g, '').slice(0, 8)),
      text: String(row.text ?? ''),
      done: Boolean(row.done),
    }
  })
}

export function normalizeTodo(raw: unknown): TodoItem {
  const t = raw as Record<string, unknown>
  const status = t.status as TodoItem['status']
  const validStatus =
    status === 'open' ||
    status === 'in_progress' ||
    status === 'done' ||
    status === 'cancelled'
      ? status
      : 'open'
  const deps = t.depends_on ?? t.dependsOn
  const item: TodoItem = {
    id: String(t.id ?? crypto.randomUUID().replace(/-/g, '')),
    title: String(t.title ?? 'Untitled'),
    spec: String(t.spec ?? ''),
    requirements: String(t.requirements ?? ''),
    design: String(t.design ?? ''),
    tasks_md: String(t.tasks_md ?? t.tasksMd ?? ''),
    depends_on: Array.isArray(deps) ? deps.map(String) : [],
    branch: String(t.branch ?? ''),
    pr_url: String(t.pr_url ?? t.prUrl ?? ''),
    status: validStatus,
    links: Array.isArray(t.links) ? t.links.map(String) : [],
    checklist: normalizeChecklist(t.checklist),
    created_at: String(t.created_at ?? new Date().toISOString()),
    updated_at: String(t.updated_at ?? new Date().toISOString()),
  }
  return migrateTodoLayers(item)
}

export function normalizeStore(raw: unknown): TodoStore {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_TODO_STORE, todos: [] }
  const o = raw as Record<string, unknown>
  const todos = Array.isArray(o.todos) ? o.todos.map((t) => normalizeTodo(t)) : []
  const activeId =
    typeof o.activeId === 'string'
      ? o.activeId
      : typeof o.active_id === 'string'
        ? o.active_id
        : null
  const activeOk = activeId && todos.some((t) => t.id === activeId) ? activeId : null
  return {
    version: typeof o.version === 'number' ? o.version : 1,
    activeId: activeOk,
    todos,
    templates: Array.isArray(o.templates) ? o.templates.map(String) : undefined,
  }
}
