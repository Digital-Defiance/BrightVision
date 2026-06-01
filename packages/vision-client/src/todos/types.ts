export type TodoStatus = 'open' | 'in_progress' | 'done' | 'cancelled'

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface TodoItem {
  id: string
  title: string
  /** Legacy single-field spec; migrated into requirements when layers are empty */
  spec: string
  requirements: string
  design: string
  tasks_md: string
  depends_on: string[]
  branch: string
  pr_url: string
  status: TodoStatus
  links: string[]
  checklist: ChecklistItem[]
  created_at: string
  updated_at: string
}

export interface TodoStore {
  version: number
  activeId: string | null
  todos: TodoItem[]
  templates?: string[]
}

export const TODO_TEMPLATES = ['feature', 'bugfix', 'refactor', 'spec-driven'] as const

export interface PatchTodoResult {
  item: TodoItem
  auto_completed: boolean
  ears_requirements_ok?: boolean | null
  ears_error_count?: number | null
}

export const EMPTY_TODO_STORE: TodoStore = {
  version: 1,
  activeId: null,
  todos: [],
}
