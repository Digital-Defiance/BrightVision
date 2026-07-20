import { describe, expect, it } from 'vitest'
import { specGenerateBlockedReason } from './specGenerateGate'

describe('specGenerateBlockedReason', () => {
  it('returns null when ready', () => {
    expect(
      specGenerateBlockedReason({
        hasTask: true,
        visionSessionReady: true,
      })
    ).toBeNull()
  })

  it('blocks when vision session is not running', () => {
    expect(
      specGenerateBlockedReason({
        hasTask: true,
        visionSessionReady: false,
      })
    ).toMatch(/Start a coding session/)
  })

  it('blocks on workspace mismatch', () => {
    expect(
      specGenerateBlockedReason({
        hasTask: true,
        visionSessionReady: true,
        workspaceMismatch: true,
      })
    ).toMatch(/different folder/)
  })
})
