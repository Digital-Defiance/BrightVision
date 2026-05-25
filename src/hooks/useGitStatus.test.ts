import { describe, expect, it } from 'vitest'
import { GIT_STATUS_POLL_MS } from './useGitStatus'

describe('useGitStatus poll policy (#26)', () => {
  it('polls every 8 seconds while session or git tab is active', () => {
    expect(GIT_STATUS_POLL_MS).toBe(8_000)
  })
})
