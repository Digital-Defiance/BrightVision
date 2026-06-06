import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPEC_GEN_TIMEOUT_PREFS,
  extendedSpecGenTimeoutPrefs,
  formatSpecGenTimeoutLabel,
  SPEC_GEN_TIMEOUT_PRESETS,
} from './specGenTimeoutPrefs'

describe('specGenTimeoutPrefs', () => {
  it('defaults to standard preset', () => {
    expect(DEFAULT_SPEC_GEN_TIMEOUT_PREFS).toEqual({
      wallTimeoutS: SPEC_GEN_TIMEOUT_PRESETS.default.wallTimeoutS,
      turnTimeoutS: SPEC_GEN_TIMEOUT_PRESETS.default.turnTimeoutS,
    })
  })

  it('extended preset matches env workaround', () => {
    expect(extendedSpecGenTimeoutPrefs()).toEqual({
      wallTimeoutS: 2400,
      turnTimeoutS: 1200,
    })
  })

  it('formats labels for UI', () => {
    expect(formatSpecGenTimeoutLabel(DEFAULT_SPEC_GEN_TIMEOUT_PREFS)).toBe('20 min job / 12 min per turn')
    expect(formatSpecGenTimeoutLabel(extendedSpecGenTimeoutPrefs())).toBe('40 min job / 20 min per turn')
  })
})
