/** LAN Link QR payload for BrightVision Lab Remote (test orchestrator on :8744). */

export interface LabLanPairingPayload {
  v: 1
  kind: 'test-lab'
  lanUrl: string
  token: string
  deviceName: string
  /** Optional — attach to an in-flight run after scan. */
  activeRunId?: string
}

export function buildLabLanPairingPayload(input: {
  lanUrl: string
  token: string
  deviceName: string
  activeRunId?: string
}): LabLanPairingPayload {
  return {
    v: 1,
    kind: 'test-lab',
    lanUrl: input.lanUrl.replace(/\/$/, ''),
    token: input.token,
    deviceName: input.deviceName,
    activeRunId: input.activeRunId,
  }
}

export function encodeLabLanPairingQr(payload: LabLanPairingPayload): string {
  return JSON.stringify(payload)
}

export function parseLabLanPairingQr(raw: string): LabLanPairingPayload | null {
  try {
    const data = JSON.parse(raw.trim()) as Record<string, unknown>
    if (data.v !== 1) return null
    if (data.kind !== 'test-lab') return null
    const lanUrl = String(data.lanUrl ?? '').trim()
    const token = String(data.token ?? '').trim()
    const deviceName = String(data.deviceName ?? 'Test Lab').trim()
    if (!lanUrl.startsWith('http://') && !lanUrl.startsWith('https://')) return null
    if (!token) return null
    const activeRunId =
      data.activeRunId != null && String(data.activeRunId).trim()
        ? String(data.activeRunId).trim()
        : undefined
    return {
      v: 1,
      kind: 'test-lab',
      lanUrl: lanUrl.replace(/\/$/, ''),
      token,
      deviceName,
      activeRunId,
    }
  } catch {
    return null
  }
}

export function labLanUrlForAddress(address: string, proxyPort: number): string {
  return `http://${address}:${proxyPort}`
}
