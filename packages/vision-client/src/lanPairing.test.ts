import { describe, expect, it } from 'vitest'
import { buildLanPairingPayload, encodeLanPairingQr, parseLanPairingQr } from './lanPairing'

describe('lanPairing', () => {
  it('round-trips QR JSON', () => {
    const payload = buildLanPairingPayload({
      lanUrl: 'http://192.168.1.10:8742/',
      token: 'secret',
      deviceName: 'MacBook',
      fingerprint: 'abc',
    })
    const parsed = parseLanPairingQr(encodeLanPairingQr(payload))
    expect(parsed).toEqual({
      v: 1,
      lanUrl: 'http://192.168.1.10:8742',
      token: 'secret',
      deviceName: 'MacBook',
      fingerprint: 'abc',
    })
  })

  it('rejects invalid payloads', () => {
    expect(parseLanPairingQr('not json')).toBeNull()
    expect(parseLanPairingQr(JSON.stringify({ v: 2 }))).toBeNull()
  })
})
