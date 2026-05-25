import { describe, expect, it } from 'vitest'
import { mergeAbortSignals } from './abort'

describe('mergeAbortSignals', () => {
  it('aborts when parent aborts', () => {
    const parent = new AbortController()
    const merged = mergeAbortSignals(parent.signal)
    parent.abort()
    expect(merged.aborted).toBe(true)
  })
})
