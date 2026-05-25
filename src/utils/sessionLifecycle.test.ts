import { describe, expect, it } from 'vitest'
import { IDLE_SNAPSHOT } from '../progress/types'
import { isSessionLifecycleActive } from './sessionLifecycle'

describe('isSessionLifecycleActive', () => {
  it('is true while connecting even if isStarting is false', () => {
    expect(
      isSessionLifecycleActive(
        {
          active: true,
          phase: 'connecting',
          label: 'Connecting',
          progress: null,
          detail: 'http://127.0.0.1:8741',
        },
        false,
        false
      )
    ).toBe(true)
  })

  it('is false when idle', () => {
    expect(isSessionLifecycleActive(IDLE_SNAPSHOT, false, false)).toBe(false)
  })
})
