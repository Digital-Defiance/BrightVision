/** LAN Link QR payload (R1). Versioned JSON for BrightVision Remote. */

export interface LanPairingPayload {
  v: 1
  lanUrl: string
  token: string
  deviceName: string
  fingerprint?: string
}

export function buildLanPairingPayload(input: {
  lanUrl: string
  token: string
  deviceName: string
  fingerprint?: string
}): LanPairingPayload {
  const url = input.lanUrl.replace(/\/$/, '')
  return {
    v: 1,
    lanUrl: url,
    token: input.token,
    deviceName: input.deviceName,
    fingerprint: input.fingerprint,
  }
}

export function encodeLanPairingQr(payload: LanPairingPayload): string {
  return JSON.stringify(payload)
}

export function parseLanPairingQr(raw: string): LanPairingPayload | null {
  try {
    const data = JSON.parse(raw.trim()) as Record<string, unknown>
    if (data.v !== 1) return null
    const lanUrl = String(data.lanUrl ?? '').trim()
    const token = String(data.token ?? '').trim()
    const deviceName = String(data.deviceName ?? 'BrightVision').trim()
    if (!lanUrl.startsWith('http://') && !lanUrl.startsWith('https://')) return null
    if (!token) return null
    return {
      v: 1,
      lanUrl: lanUrl.replace(/\/$/, ''),
      token,
      deviceName,
      fingerprint: data.fingerprint != null ? String(data.fingerprint) : undefined,
    }
  } catch {
    return null
  }
}
