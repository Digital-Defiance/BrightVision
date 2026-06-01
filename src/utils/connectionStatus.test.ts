import { describe, expect, it } from 'vitest'
import { resolveConnectionStatusLabel, resolveConnectionTone } from './connectionStatus'

describe('connectionStatus', () => {
  it('shows ready when API is up but session is not', () => {
    expect(
      resolveConnectionStatusLabel({
        statusMessage: '',
        isStarting: false,
        isRunning: false,
        apiReachable: true,
      })
    ).toContain('API up')
    expect(
      resolveConnectionTone({
        isStarting: false,
        isRunning: false,
        apiReachable: true,
      })
    ).toBe('ready')
  })

  it('prefers session live over API ready', () => {
    expect(
      resolveConnectionTone({
        isStarting: false,
        isRunning: true,
        apiReachable: true,
      })
    ).toBe('live')
  })
})
