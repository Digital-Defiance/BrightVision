/**
 * Desktop Vision HTTP via Tauri/reqwest (WebKit fetch to localhost often fails with "Load failed").
 */
import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime } from './isTauri'

export interface VisionApiFetchResult {
  status: number
  body: unknown
}

export async function desktopVisionFetchRaw(
  method: string,
  baseUrl: string,
  path: string,
  bearerToken: string | undefined,
  body?: unknown
): Promise<VisionApiFetchResult> {
  if (!isTauriRuntime()) {
    throw new Error('desktopVisionFetchRaw is only available in the desktop app')
  }
  return invoke<VisionApiFetchResult>('vision_api_fetch', {
    method: method.toUpperCase(),
    baseUrl,
    path: path.replace(/^\//, ''),
    bearerToken: bearerToken?.trim() || null,
    body: body === undefined ? null : body,
  })
}

export async function desktopVisionRequest<T>(
  method: string,
  baseUrl: string,
  path: string,
  bearerToken: string | undefined,
  body?: unknown
): Promise<T> {
  const { status, body: resBody } = await desktopVisionFetchRaw(
    method,
    baseUrl,
    path,
    bearerToken,
    body
  )
  if (status < 200 || status >= 300) {
    const detail =
      typeof resBody === 'string' ? resBody : JSON.stringify(resBody)
    throw new Error(`${method} /${path.replace(/^\//, '')}: ${status} ${detail}`)
  }
  return resBody as T
}

export async function desktopVisionPost<T>(
  baseUrl: string,
  apiPath: string,
  bearerToken: string | undefined,
  body: unknown
): Promise<T> {
  return desktopVisionRequest<T>('POST', baseUrl, apiPath, bearerToken, body)
}

export async function desktopVisionFetchBlob(
  method: string,
  baseUrl: string,
  path: string,
  bearerToken: string | undefined,
  mime = 'application/octet-stream'
): Promise<Blob> {
  const res = await invoke<{
    status: number
    body_base64: string
    content_type: string | null
  }>('vision_api_fetch_bytes', {
    method: method.toUpperCase(),
    baseUrl,
    path: path.replace(/^\//, ''),
    bearerToken: bearerToken?.trim() || null,
  })
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`${method} /${path.replace(/^\//, '')}: ${res.status}`)
  }
  const binary = atob(res.body_base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: res.content_type ?? mime })
}
