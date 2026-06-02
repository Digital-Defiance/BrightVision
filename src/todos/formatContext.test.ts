import { describe, expect, it } from 'vitest'
import { appendChecklistBlock, formatTodoContextLight } from './formatContext'
import type { TodoItem } from './types'

describe('formatTodoContextLight', () => {
  it('wraps checklist in markdown fence', () => {
    const todo: TodoItem = {
      id: 'abc12345',
      title: 'Explore repo',
      spec: '',
      requirements: '',
      design: '',
      tasks_md: '',
      depends_on: [],
      branch: '',
      pr_url: '',
      status: 'open',
      links: [],
      checklist: [{ id: 'c1', text: 'List crates', done: false }],
      created_at: '',
      updated_at: '',
    }
    const text = formatTodoContextLight(todo)
    expect(text).toContain('```markdown')
    expect(text).toContain('- [ ] List crates')
    expect(text).toContain('```')
  })
})

describe('appendChecklistBlock', () => {
  it('no-ops on empty checklist', () => {
    const lines: string[] = []
    appendChecklistBlock(lines, [])
    expect(lines).toEqual([])
  })
})
