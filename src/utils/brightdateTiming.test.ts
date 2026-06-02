import { describe, expect, it } from 'vitest'
import {
  J2000_UNIX_MS,
  bdAddSeconds,
  bdFromUnixMs,
  formatEtcBrightDate,
} from '@brightvision/vision-client'

describe('brightdateTiming epoch', () => {
  it('J2000 UTC label is BD 0 per BrightDate spec', () => {
    expect(J2000_UNIX_MS).toBe(946_727_935_816)
    expect(bdFromUnixMs(J2000_UNIX_MS)).toBeCloseTo(0, 9)
  })

  it('ETC adds duration in BD space (1 md ≈ +0.001 BD)', () => {
    const base = 9648.68
    expect(bdAddSeconds(base, 86.4)).toBeCloseTo(9648.681, 3)
    expect(formatEtcBrightDate(86.4, base)).toMatch(/BD 9648\.68/)
  })
})
