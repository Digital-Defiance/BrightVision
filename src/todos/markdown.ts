import { migrateTodoLayers } from './layers'
import type { ChecklistItem, TodoItem, TodoStore } from './types'

const LAYER_SECTIONS: Record<string, keyof TodoItem> = {
  requirements: 'requirements',
  design: 'design',
  'implementation tasks': 'tasks_md',
  specification: 'spec',
}

export function exportTodoStore(store: TodoStore): string {
  const blocks = store.todos.map((item) => {
    const migrated = migrateTodoLayers(item)
    const lines = [`# ${migrated.title}`, `id: ${migrated.id}`, `status: ${migrated.status}`]
    if (migrated.depends_on.length) {
      lines.push(`depends_on: ${migrated.depends_on.join(', ')}`)
    }
    if (migrated.branch.trim()) lines.push(`branch: ${migrated.branch.trim()}`)
    if (migrated.pr_url.trim()) lines.push(`pr: ${migrated.pr_url.trim()}`)
    lines.push('')
    if (
      migrated.requirements.trim() ||
      migrated.design.trim() ||
      migrated.tasks_md.trim()
    ) {
      lines.push(
        '## Requirements',
        migrated.requirements.trim() || '',
        '',
        '## Design',
        migrated.design.trim() || '',
        '',
        '## Implementation tasks',
        migrated.tasks_md.trim() || ''
      )
    } else {
      lines.push('## Specification', migrated.spec.trim() || '')
    }
    if (migrated.checklist?.length) {
      lines.push('', '## Checklist')
      for (const c of migrated.checklist) {
        lines.push(`- [${c.done ? 'x' : ' '}] ${c.text}`)
      }
    }
    if (migrated.links?.length) {
      lines.push('', '## Links')
      for (const link of migrated.links) {
        lines.push(`- ${link}`)
      }
    }
    return lines.join('\n')
  })
  const active = store.activeId ? `activeId: ${store.activeId}\n\n` : ''
  const body = blocks.join('\n---\n\n')
  return body ? `# BrightVision Tasks\n\n${active}${body}\n` : '# BrightVision Tasks\n\n'
}

function parseChecklistLine(line: string): ChecklistItem | null {
  const m = line.trim().match(/^-\s*\[([ xX])\]\s*(.*)$/)
  if (!m) return null
  return {
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 8),
    text: m[2].trim(),
    done: m[1].toLowerCase() === 'x',
  }
}

export function importTodoStore(
  text: string,
  existing: TodoStore | null,
  merge: boolean
): TodoStore {
  const store: TodoStore =
    merge && existing
      ? { ...existing, todos: [...existing.todos] }
      : { version: 1, activeId: null, todos: [] }
  if (!merge) {
    store.todos = []
    store.activeId = null
  }

  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  let activeFromHeader: string | null = null

  if (lines[0]?.trim().toLowerCase().startsWith('# aider vision tasks')) {
    i = 1
    while (i < lines.length && !lines[i].trim()) i++
    if (lines[i]?.trim().toLowerCase().startsWith('activeid:')) {
      activeFromHeader = lines[i].split(':')[1]?.trim() || null
      i++
    }
  }

  let current: Record<string, unknown> | null = null
  let section: string | null = null
  const sectionLines: string[] = []

  const flush = () => {
    if (!current?.title) {
      current = null
      section = null
      return
    }
    const item = migrateTodoLayers({
      id: String(current.id ?? crypto.randomUUID().replace(/-/g, '')),
      title: String(current.title),
      spec: String(current.spec ?? ''),
      requirements: String(current.requirements ?? ''),
      design: String(current.design ?? ''),
      tasks_md: String(current.tasks_md ?? ''),
      depends_on: (current.depends_on as string[]) ?? [],
      branch: String(current.branch ?? ''),
      pr_url: String(current.pr_url ?? ''),
      status: (current.status as TodoItem['status']) || 'open',
      links: (current.links as string[]) ?? [],
      checklist: (current.checklist as ChecklistItem[]) ?? [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    store.todos.push(item)
    current = null
    section = null
    sectionLines.length = 0
  }

  while (i < lines.length) {
    const line = lines[i]
    const stripped = line.trim()

    if (stripped === '---') {
      flush()
      i++
      continue
    }

    const header = stripped.match(/^#\s+(.+)$/)
    if (header && !stripped.toLowerCase().startsWith('# aider vision')) {
      flush()
      current = {
        title: header[1].trim(),
        checklist: [],
        links: [],
        depends_on: [],
        branch: '',
        pr_url: '',
      }
      section = null
      sectionLines.length = 0
      i++
      continue
    }

    if (!current) {
      i++
      continue
    }

    const idM = stripped.match(/^id:\s*(\S+)$/i)
    if (idM) {
      current.id = idM[1]
      i++
      continue
    }
    const stM = stripped.match(/^status:\s*(\S+)$/i)
    if (stM) {
      const st = stM[1].toLowerCase()
      if (st === 'open' || st === 'in_progress' || st === 'done' || st === 'cancelled') {
        current.status = st
      }
      i++
      continue
    }
    const depM = stripped.match(/^depends_on:\s*(.+)$/i)
    if (depM) {
      current.depends_on = depM[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      i++
      continue
    }
    const branchM = stripped.match(/^branch:\s*(.+)$/i)
    if (branchM) {
      current.branch = branchM[1].trim()
      i++
      continue
    }
    const prM = stripped.match(/^pr:\s*(.+)$/i)
    if (prM) {
      current.pr_url = prM[1].trim()
      i++
      continue
    }

    if (stripped.toLowerCase().startsWith('## ')) {
      if (section && sectionLines.length && section in LAYER_SECTIONS) {
        const key = LAYER_SECTIONS[section]
        current[key] = sectionLines.join('\n').trim()
      } else if (section === 'spec' && sectionLines.length) {
        current.spec = sectionLines.join('\n').trim()
      }
      const sectionKey = stripped.slice(3).trim().toLowerCase()
      section = LAYER_SECTIONS[sectionKey] ?? sectionKey
      sectionLines.length = 0
      i++
      continue
    }

    if (section === 'checklist') {
      const entry = parseChecklistLine(stripped)
      if (entry) {
        current.checklist = [...((current.checklist as ChecklistItem[]) ?? []), entry]
      }
    } else if (section === 'links') {
      if (stripped.startsWith('- ')) {
        current.links = [...((current.links as string[]) ?? []), stripped.slice(2).trim()]
      }
    } else if (
      section === 'requirements' ||
      section === 'design' ||
      section === 'tasks_md' ||
      section === 'spec'
    ) {
      sectionLines.push(line)
    }
    i++
  }

  if (section && sectionLines.length && current) {
    if (section in LAYER_SECTIONS) {
      current[LAYER_SECTIONS[section]] = sectionLines.join('\n').trim()
    } else if (section === 'spec') {
      current.spec = sectionLines.join('\n').trim()
    }
  }
  flush()

  if (activeFromHeader && store.todos.some((t) => t.id === activeFromHeader)) {
    store.activeId = activeFromHeader
  }
  return store
}
