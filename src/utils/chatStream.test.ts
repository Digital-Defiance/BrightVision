import { describe, expect, it } from 'vitest'
import {
  appendStreamingToken,
  initialAssistantBubbleChunk,
  mergeChatTimeline,
  popPendingUserMessageId,
  reconcileUserMessageInChat,
  removeChatMessageById,
  shiftPendingUserMessageId,
  getActiveAssistantSection,
  splitAssistantSections,
  suffixPrefixOverlap,
  withInheritedModelRoutes,
} from './chatStream'

describe('splitAssistantSections', () => {
  it('returns body when no markers', () => {
    expect(splitAssistantSections('hello')).toEqual([{ kind: 'body', content: 'hello' }])
  })

  it('splits thinking and answer markers', () => {
    const text = '► **THINKING**\nplan\n► **ANSWER**\nresult'
    const sections = splitAssistantSections(text)
    expect(sections.map((s) => s.kind)).toEqual(['thinking', 'answer'])
    expect(sections[0].content).toContain('plan')
    expect(sections[1].content).toContain('result')
  })

  it('reports active section while streaming', () => {
    expect(getActiveAssistantSection('► **THINKING**\nplan\n')).toBe('thinking')
    expect(getActiveAssistantSection('► **THINKING**\nplan\n► **ANSWER**\n')).toBe('answer')
  })

  it('includes reasoning section', () => {
    const text = '► **REASONING**\nwhy\n► **ANSWER**\nok'
    const sections = splitAssistantSections(text)
    expect(sections.some((s) => s.kind === 'reasoning')).toBe(true)
    expect(sections.some((s) => s.kind === 'answer')).toBe(true)
  })
})

describe('optimistic user messages', () => {
  type Msg = { id: number; role: 'user'; content: string }

  const make = (id: number, content: string): Msg => ({ id, role: 'user', content })

  it('reconciles server text onto pending bubble', () => {
    const pending = [42]
    const pendingId = shiftPendingUserMessageId(pending)
    const out = reconcileUserMessageInChat(
      [make(42, 'hi')],
      pendingId,
      'hi with spec',
      make,
      () => 99
    )
    expect(out).toHaveLength(1)
    expect(out[0].content).toBe('hi with spec')
    expect(pending).toEqual([])
  })

  it('appends when no pending id', () => {
    const out = reconcileUserMessageInChat([], undefined, 'from core', make, () => 7)
    expect(out).toEqual([make(7, 'from core')])
  })

  it('FIFO pending ids match queue order', () => {
    const pending = [1, 2]
    expect(shiftPendingUserMessageId(pending)).toBe(1)
    expect(shiftPendingUserMessageId(pending)).toBe(2)
    expect(shiftPendingUserMessageId(pending)).toBeUndefined()
  })

  it('pop removes last pending for failed send', () => {
    const pending = [10, 20]
    expect(popPendingUserMessageId(pending)).toBe(20)
    expect(pending).toEqual([10])
  })

  it('removeChatMessageById drops optimistic bubble', () => {
    const msgs = [make(10, 'oops'), make(11, 'keep')]
    expect(removeChatMessageById(msgs, 10)).toEqual([make(11, 'keep')])
  })
})

describe('appendStreamingToken', () => {
  it('appends deltas', () => {
    expect(appendStreamingToken('In ', 'Progress')).toBe('In Progress')
  })

  it('replaces with cumulative snapshot', () => {
    expect(appendStreamingToken('In ', 'In Progress')).toBe('In Progress')
  })

  it('avoids duplicated cumulative words', () => {
    let text = ''
    for (const snap of ['In ', 'In Progress', 'In Progress Progress']) {
      text = appendStreamingToken(text, snap)
    }
    expect(text).toBe('In Progress Progress')
    expect(text).not.toContain('In In')
    expect(text).not.toContain('Progress Progress Progress')
  })

  it('skips identical chunk', () => {
    expect(appendStreamingToken('hello', 'hello')).toBe('hello')
  })

  it('merges overlapping chunks', () => {
    expect(suffixPrefixOverlap('In Progress', 'Progress more')).toBe(8)
    expect(appendStreamingToken('In Progress', 'Progress more')).toBe('In Progress more')
  })
})

describe('initialAssistantBubbleChunk', () => {
  it('returns full chunk for the first bubble in a turn', () => {
    expect(initialAssistantBubbleChunk('', 'Hello')).toBe('Hello')
  })

  it('strips prior assistant text when provider resends cumulative snapshot', () => {
    const prior = "I'll start by examining the relevant files."
    const chunk = `${prior}{"tasks":[]}`
    expect(initialAssistantBubbleChunk(prior, chunk)).toBe('{"tasks":[]}')
  })

  it('returns empty when chunk adds nothing new', () => {
    const prior = 'Done.'
    expect(initialAssistantBubbleChunk(prior, 'Done.')).toBe('')
    expect(initialAssistantBubbleChunk(prior, prior)).toBe('')
  })
})

describe('withInheritedModelRoutes', () => {
  it('carries route across assistant bubbles until the next user message', () => {
    const route = { tier: 'code', role: 'code', model: 'qwen3.6:27b' }
    const out = withInheritedModelRoutes([
      { id: 1, role: 'user', content: 'go' },
      { id: 2, role: 'assistant', content: 'a', modelRoute: route },
      { id: 3, role: 'assistant', content: 'b' },
      { id: 4, role: 'user', content: 'again' },
      { id: 5, role: 'assistant', content: 'c' },
    ])
    expect(out[1].modelRoute).toEqual(route)
    expect(out[2].modelRoute).toEqual(route)
    expect(out[4].modelRoute).toBeUndefined()
  })
})

describe('mergeChatTimeline', () => {
  it('orders messages and tools by monotonic id', () => {
    const merged = mergeChatTimeline(
      [
        { id: 1, role: 'user' as const, content: 'hi' },
        { id: 4, role: 'assistant' as const, content: 'reply tail' },
      ],
      [
        { id: 2, type: 'tool_result' as const, name: 'output', output: 'Added a.md' },
        { id: 3, type: 'tool_result' as const, name: 'output', output: 'Added b.md' },
      ]
    )
    expect(merged.map((e) => (e.kind === 'message' ? `m${e.item.id}` : `t${e.item.id}`))).toEqual([
      'm1',
      't2',
      't3',
      'm4',
    ])
  })
})
