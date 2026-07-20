import { describe, expect, it } from 'vitest'
import type { ToolEvent } from '../components/chat/ChatPanel'
import {
  groupToolEvents,
  parseArgumentsLine,
  parseRangeLine,
  parseToolCallLine,
} from './toolOutputGroups'

function ev(id: number, output: string, name = 'output'): ToolEvent {
  return { id, type: 'tool_result', name, output }
}

describe('parseToolCallLine', () => {
  it('parses Local agent tool header', () => {
    expect(parseToolCallLine('Tool Call: Local • ReadRange')).toEqual({
      scope: 'Local',
      toolName: 'ReadRange',
    })
  })
})

describe('parseArgumentsLine', () => {
  it('parses Arguments prefix as JSON', () => {
    expect(parseArgumentsLine('Arguments: {"path": "lib", "limit": 20}')).toEqual({
      path: 'lib',
      limit: 20,
    })
  })
})

describe('parseRangeLine', () => {
  it('parses ReadRange range chip line', () => {
    expect(parseRangeLine('range_1: pubspec.yaml • @000 • 000@')).toEqual({
      index: 1,
      file: 'pubspec.yaml',
      start: '@000',
      end: '000@',
    })
  })
})

describe('groupToolEvents', () => {
  it('groups call, args, range, and result into one invocation', () => {
    const grouped = groupToolEvents([
      ev(1, 'Tool Call: Local • GitStatus'),
      ev(2, 'Arguments: {"path": "."}'),
      ev(3, 'On branch main'),
      ev(4, 'Tool Call: Local • ReadRange'),
      ev(5, 'range_1: pubspec.yaml • @000 • 000@'),
      ev(6, '✅ Retrieved context for 1 operation(s)'),
    ])
    expect(grouped).toHaveLength(2)
    expect(grouped[0]).toMatchObject({
      kind: 'invocation',
      toolName: 'GitStatus',
      args: { path: '.' },
      results: ['On branch main'],
    })
    expect(grouped[1]).toMatchObject({
      kind: 'invocation',
      toolName: 'ReadRange',
      ranges: [{ file: 'pubspec.yaml' }],
      results: ['✅ Retrieved context for 1 operation(s)'],
    })
  })

  it('marks invocation failed when error follows', () => {
    const grouped = groupToolEvents([
      ev(1, 'Tool Call: Local • ReadRange'),
      ev(2, 'range_1: tasks.md • @000 • 000@'),
      ev(3, 'Errors encountered for 1 operation(s)', 'error'),
    ])
    expect(grouped).toHaveLength(1)
    expect(grouped[0]).toMatchObject({
      kind: 'invocation',
      failed: true,
      error: 'Errors encountered for 1 operation(s)',
    })
  })
})
