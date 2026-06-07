import { describe, expect, it } from 'vitest'
import {
  appendChecklistBlock,
  buildImplementStepMessage,
  buildResumeWorkMessage,
  buildStartWorkMessage,
  formatTodoContextLight,
  shouldResumeWork,
} from './formatContext'
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

const specTodo: TodoItem = {
  id: 'abc12345',
  title: 'Flutter app',
  spec: '',
  requirements: '### REQ-001\n**WHEN** x **THE** system **SHALL** y',
  design: 'Overview',
  tasks_md: '- [ ] 1. Scaffold',
  depends_on: [],
  branch: '',
  pr_url: '',
  status: 'open',
  links: [],
  checklist: [],
  created_at: '',
  updated_at: '',
}

describe('buildStartWorkMessage', () => {
  it('prefixes /agent when task has spec layers', () => {
    const msg = buildStartWorkMessage(specTodo, [])
    expect(msg.startsWith('/agent ')).toBe(true)
    expect(msg).toContain('Implement the active task')
  })

  it('uses resume prompt when task is in progress', () => {
    const msg = buildStartWorkMessage(
      { ...specTodo, status: 'in_progress', links: ['commit:abc'] },
      []
    )
    expect(msg).toContain('Continue the active task from where you stopped')
    expect(msg).toContain('Do not reset completed checklist items')
  })
})

describe('shouldResumeWork', () => {
  it('detects in_progress status', () => {
    expect(shouldResumeWork({ ...specTodo, status: 'in_progress' })).toBe(true)
  })

  it('detects checklist progress', () => {
    expect(
      shouldResumeWork({
        ...specTodo,
        checklist: [{ id: 'c1', text: 'Done step', done: true }],
      })
    ).toBe(true)
  })

  it('is false for fresh open tasks', () => {
    expect(shouldResumeWork(specTodo)).toBe(false)
  })
})

describe('buildResumeWorkMessage', () => {
  it('routes /agent for spec tasks', () => {
    const msg = buildResumeWorkMessage({ ...specTodo, status: 'in_progress' }, [])
    expect(msg.startsWith('/agent Continue the active task')).toBe(true)
  })
})

describe('buildImplementStepMessage', () => {
  it('prefixes /agent for implement step', () => {
    const msg = buildImplementStepMessage({ number: 1, text: 'Scaffold lib/', done: false }, specTodo)
    expect(msg.startsWith('/agent Implement only')).toBe(true)
  })
})
