import { describe, expect, it } from 'vitest'
import { sseEventResetsIdleTimer } from './sseIdle'

describe('sseEventResetsIdleTimer', () => {
  it('ignores user_message so the post-event idle clock does not start early', () => {
    expect(sseEventResetsIdleTimer({ type: 'user_message' })).toBe(false)
  })

  it('treats progress and tokens as stream activity', () => {
    expect(sseEventResetsIdleTimer({ type: 'progress' })).toBe(true)
    expect(sseEventResetsIdleTimer({ type: 'token' })).toBe(true)
    expect(sseEventResetsIdleTimer({ type: 'done' })).toBe(true)
  })
})
