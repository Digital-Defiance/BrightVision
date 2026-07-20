import { describe, expect, it } from 'vitest'
import { isSpecJobTimeoutError, specJobTimeoutHint } from './specJobTimeout'

describe('specJobTimeout', () => {
  it('detects server spec generation timeout messages', () => {
    expect(isSpecJobTimeoutError('Spec generation job timed out after 1200s')).toBe(true)
    expect(isSpecJobTimeoutError('Spec job poll timed out')).toBe(true)
    expect(isSpecJobTimeoutError('Network error')).toBe(false)
  })

  it('formats user hint from wall timeout', () => {
    expect(specJobTimeoutHint(2400)).toContain('40-minute')
    expect(specJobTimeoutHint(2400)).toContain('Extend & retry')
  })
})
