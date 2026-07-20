import { describe, expect, it } from 'vitest'
import { resolveSendTodoOptions } from './sendTodoOptions'

describe('resolveSendTodoOptions', () => {
  const taskA = { id: 'task-a' }

  it('uses pending binding from Tasks tab over activeTodo', () => {
    expect(
      resolveSendTodoOptions(
        { activeTodoId: 'task-b', injectTodoSpec: true },
        taskA,
        'task-a'
      )
    ).toEqual({ activeTodoId: 'task-b', injectTodoSpec: true })
  })

  it('resume pending binding can skip spec inject', () => {
    expect(
      resolveSendTodoOptions(
        { activeTodoId: 'task-b', injectTodoSpec: false },
        taskA,
        null
      )
    ).toEqual({ activeTodoId: 'task-b', injectTodoSpec: false })
  })

  it('falls back to activeTodo when no pending binding', () => {
    expect(resolveSendTodoOptions(null, taskA, null)).toEqual({
      activeTodoId: 'task-a',
      injectTodoSpec: true,
    })
  })

  it('does not re-inject spec for the same task in-session', () => {
    expect(resolveSendTodoOptions(null, taskA, 'task-a')).toEqual({
      activeTodoId: 'task-a',
      injectTodoSpec: false,
    })
  })

  it('returns undefined when no pending binding and no active task', () => {
    expect(resolveSendTodoOptions(null, null, null)).toBeUndefined()
  })
})
