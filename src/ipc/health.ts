import { CoreHttpClient } from './httpClient'

/** Poll until core-serve is accepting connections (desktop spawn is async). */
export async function waitForVisionApi(
  client: CoreHttpClient,
  maxAttempts = 40,
  intervalMs = 250
): Promise<void> {
  let lastError: unknown
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await client.health()
      return
    } catch (err) {
      lastError = err
      await new Promise((r) => setTimeout(r, intervalMs))
    }
  }
  throw new Error(
    `Vision API not ready at ${client.baseUrl}${
      lastError instanceof Error ? `: ${lastError.message}` : ''
    }`
  )
}
