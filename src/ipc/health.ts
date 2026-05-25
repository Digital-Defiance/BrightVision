import { abortAfter, mergeAbortSignals } from '../utils/abort'
import { CoreHttpClient } from './httpClient'

const HEALTH_TIMEOUT_MS = 4_000

const isE2eBuild = import.meta.env.E2E === 'true'

/** Poll until core-serve is accepting connections (desktop spawn is async). */
export async function waitForVisionApi(
  client: CoreHttpClient,
  signal?: AbortSignal,
  maxAttempts = isE2eBuild ? 8 : 40,
  intervalMs = isE2eBuild ? 100 : 250
): Promise<void> {
  let lastError: unknown
  for (let i = 0; i < maxAttempts; i++) {
    if (signal?.aborted) {
      throw new DOMException('Vision API connection cancelled', 'AbortError')
    }
    const attemptSignal = mergeAbortSignals(signal, abortAfter(HEALTH_TIMEOUT_MS, signal))
    try {
      await client.health(attemptSignal)
      return
    } catch (err) {
      lastError = err
      if (signal?.aborted) {
        throw new DOMException('Vision API connection cancelled', 'AbortError')
      }
      await new Promise((r) => setTimeout(r, intervalMs))
    }
  }
  throw new Error(
    `Vision API not ready at ${client.baseUrl}${
      lastError instanceof Error ? `: ${lastError.message}` : ''
    }`
  )
}
