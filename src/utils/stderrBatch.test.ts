import { describe, expect, it, vi } from 'vitest'
import { StderrBatcher, shouldSkipStderrLine } from './stderrBatch'

describe('stderrBatch', () => {
  it('skips progress noise', () => {
    expect(shouldSkipStderrLine('Scanning repo: 42%')).toBe(true)
  })

  it('joins rapid lines into one flush', () => {
    vi.useFakeTimers()
    const flushed: string[] = []
    const batcher = new StderrBatcher((t) => flushed.push(t), 50)

    batcher.push('ERROR: Exception in ASGI application')
    batcher.push('  + Exception Group Traceback')
    vi.advanceTimersByTime(50)

    expect(flushed).toHaveLength(1)
    expect(flushed[0]).toContain('ERROR: Exception')
    expect(flushed[0]).toContain('Exception Group')
    vi.useRealTimers()
  })
})
