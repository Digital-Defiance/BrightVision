import { describe, expect, it } from 'vitest'
import {
  buildLabLanPairingPayload,
  encodeLabLanPairingQr,
  labLanUrlForAddress,
  parseLabLanPairingQr,
} from './labLanPairing'

describe('labLanPairing', () => {
  it('round-trips QR JSON', () => {
    const payload = buildLabLanPairingPayload({
      lanUrl: 'http://192.168.1.10:8744',
      token: 'secret',
      deviceName: 'Jessica MacBook',
      activeRunId: 'run-abc',
    })
    const raw = encodeLabLanPairingQr(payload)
    expect(parseLabLanPairingQr(raw)).toEqual(payload)
  })

  it('rejects vision remote payloads', () => {
    const raw = JSON.stringify({
      v: 1,
      lanUrl: 'http://192.168.1.10:8742',
      token: 'x',
      deviceName: 'BV',
    })
    expect(parseLabLanPairingQr(raw)).toBeNull()
  })

  it('builds LAN URL from address', () => {
    expect(labLanUrlForAddress('10.0.0.5', 8744)).toBe('http://10.0.0.5:8744')
  })
})
