import type { CoreHttpClient } from '../ipc/httpClient'

/** Download session debug JSON from the Vision API. */
export async function downloadSessionDebugBundle(
  client: CoreHttpClient,
  sessionId: string
): Promise<void> {
  const blob = await client.fetchSessionDebugBlob(sessionId)
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const a = document.createElement('a')
  a.href = url
  a.download = `brightvision-session-${sessionId.slice(0, 8)}-${stamp}-debug.json`
  a.click()
  URL.revokeObjectURL(url)
}
