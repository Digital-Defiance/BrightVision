import type { CoreHttpClient } from '../ipc/httpClient'

/** Download spec job debug JSON from the Vision API. */
export async function downloadSpecJobDebugBundle(
  client: CoreHttpClient,
  jobId: string
): Promise<void> {
  const blob = await client.fetchSpecJobDebugBlob(jobId)
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const a = document.createElement('a')
  a.href = url
  a.download = `brightvision-spec-job-${jobId.slice(0, 8)}-${stamp}-debug.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function shortSpecJobId(jobId: string): string {
  return jobId.slice(0, 8)
}
