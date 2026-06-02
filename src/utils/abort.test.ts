import { describe, expect, it } from 'vitest'
import { isBenignTurnStopError, isUserCancellationError, mergeAbortSignals } from './abort'

describe('isUserCancellationError', () => {
  it('detects AbortError', () => {
    expect(isUserCancellationError(new DOMException('Aborted', 'AbortError'))).toBe(true)
    expect(isUserCancellationError(new Error('The operation was aborted'))).toBe(true)
  })

  it('ignores real failures', () => {
    expect(isUserCancellationError(new Error('message: 500'))).toBe(false)
  })
})

describe('isBenignTurnStopError', () => {
  it('detects bgpucap shutdown timeout', () => {
    expect(
      isBenignTurnStopError(
        "Command '['/opt/homebrew/bin/bgpucap', '-f', 'json']' timed out after 5 seconds"
      )
    ).toBe(true)
  })
})

describe('mergeAbortSignals', () => {
  it('aborts when parent aborts', () => {
    const parent = new AbortController()
    const merged = mergeAbortSignals(parent.signal)
    parent.abort()
    expect(merged.aborted).toBe(true)
  })
})
