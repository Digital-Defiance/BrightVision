import type { ChecklistItem, TodoItem } from './types'
import { migrateTodoLayers } from './layers'
import type { ImplementationStep } from './tasksMd'

function layerOrPlaceholder(text: string, placeholder: string): string {
  return text.trim() || placeholder
}

/** GFM checklist in a markdown fence so chat renders task list UI. */
export function appendChecklistBlock(lines: string[], checklist: ChecklistItem[]): void {
  if (!checklist?.length) return
  lines.push('', '## Checklist', '```markdown')
  for (const entry of checklist) {
    lines.push(`- [${entry.done ? 'x' : ' '}] ${entry.text}`)
  }
  lines.push('```')
}

/** Prepended once per active-task activation (UI fallback when API inject is off). */
export function formatTodoContext(todo: TodoItem, allTodos?: TodoItem[]): string {
  const item = migrateTodoLayers(todo)
  const lines = [`[Active task: ${item.title} · id ${item.id.slice(0, 8)}]`, '']
  if (item.branch.trim()) {
    lines.push(`**Git branch:** ${item.branch.trim()}`)
  }
  if (item.pr_url.trim()) {
    lines.push(`**Pull request:** ${item.pr_url.trim()}`)
  }
  if (item.branch.trim() || item.pr_url.trim()) {
    lines.push('')
  }

  if (item.depends_on.length && allTodos?.length) {
    const pending: string[] = []
    for (const depId of item.depends_on) {
      const dep = allTodos.find((t) => t.id === depId || t.id.startsWith(depId))
      if (dep && dep.status !== 'done') {
        pending.push(`${dep.title} (${dep.id.slice(0, 8)})`)
      }
    }
    if (pending.length) {
      lines.push(`**Blocked by:** ${pending.join(', ')}`, '')
    }
  }

  lines.push(
    '## Requirements',
    layerOrPlaceholder(item.requirements, '(No requirements yet.)'),
    '',
    '## Design',
    layerOrPlaceholder(item.design, '(No design yet.)'),
    '',
    '## Implementation tasks',
    layerOrPlaceholder(item.tasks_md, '(No implementation tasks yet.)')
  )

  if (item.spec.trim() && item.spec.trim() !== item.requirements.trim()) {
    lines.push('', '## Legacy specification', item.spec.trim())
  }

  appendChecklistBlock(lines, item.checklist)
  lines.push('', '---', '')
  return lines.join('\n')
}

export function todoHasSpecLayers(todo: TodoItem): boolean {
  const item = migrateTodoLayers(todo)
  const placeholders = new Set([
    '(No requirements yet.)',
    '(No design yet.)',
    '(No implementation tasks yet.)',
  ])
  for (const text of [item.requirements, item.design, item.spec]) {
    const trimmed = text.trim()
    if (trimmed && !placeholders.has(trimmed)) return true
  }
  return false
}

export function formatTodoContextLight(todo: TodoItem, allTodos?: TodoItem[]): string {
  const item = migrateTodoLayers(todo)
  const lines = [`[Active task: ${item.title} · id ${item.id.slice(0, 8)}]`, '']
  if (item.branch.trim()) {
    lines.push(`**Git branch:** ${item.branch.trim()}`)
  }
  if (item.pr_url.trim()) {
    lines.push(`**Pull request:** ${item.pr_url.trim()}`)
  }
  if (item.branch.trim() || item.pr_url.trim()) {
    lines.push('')
  }

  if (item.depends_on.length && allTodos?.length) {
    const pending: string[] = []
    for (const depId of item.depends_on) {
      const dep = allTodos.find((t) => t.id === depId || t.id.startsWith(depId))
      if (dep && dep.status !== 'done') {
        pending.push(`${dep.title} (${dep.id.slice(0, 8)})`)
      }
    }
    if (pending.length) {
      lines.push(`**Blocked by:** ${pending.join(', ')}`, '')
    }
  }

  if (item.checklist?.length) {
    appendChecklistBlock(lines, item.checklist)
  } else if (item.tasks_md.trim()) {
    lines.push('## Tasks', item.tasks_md.trim())
  }
  lines.push('', '---', '')
  return lines.join('\n')
}

export function buildStartWorkMessage(todo: TodoItem, allTodos: TodoItem[]): string {
  const item = migrateTodoLayers(todo)
  const blocked = item.depends_on.some((depId) => {
    const dep = allTodos.find((t) => t.id === depId || t.id.startsWith(depId))
    return dep && dep.status !== 'done'
  })
  let body: string
  if (todoHasSpecLayers(item)) {
    if (blocked) {
      body =
        'Implement the active task per the injected requirements, design, and implementation tasks. ' +
        'Resolve or acknowledge blocking dependencies first.'
    } else {
      body =
        'Implement the active task per the injected requirements, design, and implementation tasks. ' +
        'Work through implementation tasks in order; update the checklist as you complete acceptance items.'
    }
    return `/agent ${body}`
  }
  if (blocked) {
    return 'Work the active task checklist in order. Resolve or acknowledge blocking dependencies first.'
  }
  return 'Work the active task checklist in order. Mark items done as you complete them.'
}

export function buildImplementStepMessage(step: ImplementationStep, todo: TodoItem): string {
  const blocked =
    todo.depends_on.length > 0
      ? ' Acknowledge any blocking dependencies noted in context before coding.'
      : ''
  return (
    `/agent Implement only implementation task ${step.number}: ${step.text}. ` +
    `Do not implement other numbered tasks in this turn unless required as a direct dependency.${blocked}`
  )
}
