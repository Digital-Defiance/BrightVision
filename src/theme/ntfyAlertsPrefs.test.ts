import { describe, expect, it } from 'vitest'
import {
  formatSpecJobCompleteNtfyBody,
  formatTurnCompleteNtfyBody,
  ntfyAppSubscribeUrl,
  ntfySubscribeUrl,
  shouldSendNtfyTurnAlert,
} from './ntfyAlertsPrefs'

describe('ntfyAlertsPrefs', () => {
  it('formats duration-only body without prompt text', () => {
    expect(
      formatTurnCompleteNtfyBody({ durationMs: 32 * 60_000 + 21_000, queuedRemaining: 0, editedCount: 0 })
    ).toBe('Turn finished in 32m 21s. Ready in BrightVision.')
  })

  it('formats spec job body without prompt text', () => {
    expect(
      formatSpecJobCompleteNtfyBody({
        durationMs: 95_000,
        mode: 'generate',
        section: 'requirements',
        taskTitle: 'Colonize the moon',
        outcome: 'saved',
      })
    ).toBe(
      'Requirements generation (“Colonize the moon”) finished in 1m 35s. Ready in BrightVision.'
    )
    expect(
      formatSpecJobCompleteNtfyBody({
        durationMs: 12_000,
        mode: 'refine',
        section: 'all',
        outcome: 'ears_blocked',
      })
    ).toMatch(/Spec refine finished in 12s but was not saved \(EARS\)/)
  })

  it('builds subscribe URL', () => {
    expect(
      ntfySubscribeUrl({ serverBase: 'https://ntfy.sh', topic: 'bv_abc' })
    ).toBe('https://ntfy.sh/bv_abc')
  })

  it('builds ntfy app deep link with display name', () => {
    expect(
      ntfyAppSubscribeUrl({ serverBase: 'https://ntfy.sh', topic: 'bv_abc' })
    ).toBe('ntfy://ntfy.sh/bv_abc?display=BrightVision')
  })

  it('marks self-hosted http as insecure for ntfy app', () => {
    expect(
      ntfyAppSubscribeUrl({ serverBase: 'http://192.168.1.5:8080', topic: 'bv_abc' })
    ).toBe('ntfy://192.168.1.5:8080/bv_abc?display=BrightVision&secure=false')
  })

  it('skips when disabled or window visible', () => {
    const prefs = {
      enabled: true,
      serverBase: 'https://ntfy.sh',
      topic: 'bv_x',
      minDurationSec: 60,
      notifyWhenBackgroundOnly: true,
    }
    expect(
      shouldSendNtfyTurnAlert(prefs, { durationMs: 120_000, documentVisible: true })
    ).toBe(false)
    expect(
      shouldSendNtfyTurnAlert(prefs, { durationMs: 120_000, documentVisible: false })
    ).toBe(true)
  })
})
