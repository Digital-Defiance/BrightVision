import { describe, expect, it } from 'vitest'
import {
  popPendingUserMessageId,
  reconcileUserMessageInChat,
  removeChatMessageById,
  shiftPendingUserMessageId,
  splitAssistantSections,
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
