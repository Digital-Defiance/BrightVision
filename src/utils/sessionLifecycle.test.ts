import { describe, expect, it } from 'vitest'
import { IDLE_SNAPSHOT } from '../progress/types'
import { isSessionLifecycleActive, isSessionRestartInFlight } from './sessionLifecycle'

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

  it('is true while session is running even when process is idle', () => {
    expect(isSessionLifecycleActive(IDLE_SNAPSHOT, true, false)).toBe(true)
  })
})

describe('isSessionRestartInFlight', () => {
  it('is false during a steady running session', () => {
    expect(isSessionRestartInFlight(IDLE_SNAPSHOT, false)).toBe(false)
  })

  it('is true while starting or in a lifecycle phase', () => {
    expect(isSessionRestartInFlight(IDLE_SNAPSHOT, true)).toBe(true)
    expect(
      isSessionRestartInFlight(
        {
          active: true,
          phase: 'booting_api',
          label: 'Starting Local LLM',
          progress: 0.1,
          detail: 'gemma',
        },
        false
      )
    ).toBe(true)
  })
})
