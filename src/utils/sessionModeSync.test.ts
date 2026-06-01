import { describe, expect, it } from 'vitest'
import { sessionModeSync, sessionModeSyncHint } from './sessionModeSync'

describe('sessionModeSync', () => {
  it('is idle when no session', () => {
    expect(
      sessionModeSync({ sessionRunning: false, liveMode: 'vibe', selectedMode: 'spec' })
    ).toBe('idle')
  })

  it('is live when selection matches running session', () => {
    expect(
      sessionModeSync({ sessionRunning: true, liveMode: 'spec', selectedMode: 'spec' })
    ).toBe('live')
  })

  it('is pending when selection differs from running session', () => {
    expect(
      sessionModeSync({ sessionRunning: true, liveMode: 'vibe', selectedMode: 'spec' })
    ).toBe('pending')
    expect(sessionModeSyncHint('pending', 'vibe', 'spec')).toContain('still Vibe')
  })
})
