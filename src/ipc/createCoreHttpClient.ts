import { CoreHttpClient } from '@brightvision/vision-client'
import { patchCoreHttpClientForTauri } from './desktopHttpClientPatch'
import { isTauriRuntime } from './isTauri'

/** Vision HTTP client; on desktop, mutating requests use Tauri/reqwest instead of WebKit fetch. */
export function createCoreHttpClient(baseUrl: string, token?: string): CoreHttpClient {
  const client = new CoreHttpClient(baseUrl, token)
  if (isTauriRuntime()) {
    patchCoreHttpClientForTauri(client, token)
  }
  return client
}
