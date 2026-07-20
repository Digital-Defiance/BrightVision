import { describe, expect, it } from 'vitest'
import { isCoreEvent } from './events'
import { sseEventResetsIdleTimer } from './sseIdle'

describe('isCoreEvent', () => {
  it('rejects null SSE payloads', () => {
    expect(isCoreEvent(null)).toBe(false)
  })

  it('accepts typed events', () => {
    expect(isCoreEvent({ type: 'token', text: 'hi' })).toBe(true)
  })
})

describe('sseEventResetsIdleTimer', () => {
  it('ignores null events', () => {
    expect(sseEventResetsIdleTimer(null)).toBe(false)
  })

  it('resets on token events', () => {
    expect(sseEventResetsIdleTimer({ type: 'token' })).toBe(true)
  })
})
