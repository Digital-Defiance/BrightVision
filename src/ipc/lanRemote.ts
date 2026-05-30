import { invoke } from '@tauri-apps/api/core'
import { buildLanPairingPayload, encodeLanPairingQr, type LanPairingPayload } from '@brightvision/vision-client'
import { isTauriRuntime } from './isTauri'

export const DEFAULT_LAN_PROXY_PORT = 8742

export interface LanRemoteStatus {
  running: boolean
  proxyPort: number
  corePort: number
  addresses: string[]
}

export async function generateVisionApiToken(): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error('Token generation requires the desktop app')
  }
  return invoke<string>('generate_vision_api_token')
}

export async function getLanHostAddresses(): Promise<string[]> {
  if (!isTauriRuntime()) return []
  return invoke<string[]>('get_lan_host_addresses')
}

export async function startLanRemoteProxy(args: {
  token: string
  corePort?: number
  proxyPort?: number
  deviceName?: string
}): Promise<LanRemoteStatus> {
  return invoke<LanRemoteStatus>('start_lan_remote_proxy', {
    token: args.token,
    corePort: args.corePort ?? null,
    proxyPort: args.proxyPort ?? DEFAULT_LAN_PROXY_PORT,
    deviceName: args.deviceName ?? 'BrightVision',
  })
}

export async function stopLanRemoteProxy(): Promise<void> {
  if (!isTauriRuntime()) return
  await invoke('stop_lan_remote_proxy')
}

export async function lanRemoteProxyStatus(): Promise<LanRemoteStatus> {
  if (!isTauriRuntime()) {
    return { running: false, proxyPort: DEFAULT_LAN_PROXY_PORT, corePort: 8741, addresses: [] }
  }
  return invoke<LanRemoteStatus>('lan_remote_proxy_status')
}

export function primaryLanApiUrl(addresses: string[], proxyPort: number): string | null {
  const ip = addresses[0]
  if (!ip) return null
  return `http://${ip}:${proxyPort}`
}

export function buildLanPairingQrPayload(input: {
  addresses: string[]
  proxyPort: number
  token: string
  deviceName: string
}): LanPairingPayload | null {
  const lanUrl = primaryLanApiUrl(input.addresses, input.proxyPort)
  if (!lanUrl || !input.token.trim()) return null
  return buildLanPairingPayload({
    lanUrl,
    token: input.token.trim(),
    deviceName: input.deviceName,
    fingerprint: input.token.trim().slice(0, 8),
  })
}

export function lanPairingQrString(payload: LanPairingPayload): string {
  return encodeLanPairingQr(payload)
}
