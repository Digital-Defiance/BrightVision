import { useCallback, useEffect, useState } from 'react'
import type { CecliWorkspaceInfo } from '../ipc/httpClient'
import { createCoreHttpClient } from '../ipc/httpClient'

const EMPTY: CecliWorkspaceInfo = {
  present: false,
  project_count: 0,
  projects: [],
}

export function useCecliWorkspace(
  workingDir: string,
  coreApiUrl: string,
  coreApiToken?: string
) {
  const [info, setInfo] = useState<CecliWorkspaceInfo>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const dir = workingDir?.trim()
    if (!dir) {
      setInfo(EMPTY)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const client = createCoreHttpClient(coreApiUrl, coreApiToken || undefined)
      const next = await client.getCecliWorkspace(dir)
      setInfo(next)
    } catch (e) {
      setInfo(EMPTY)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [workingDir, coreApiUrl, coreApiToken])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const multiRepoLabel =
    info.present && info.project_count > 1
      ? `${info.project_count} repos`
      : info.present && info.project_count === 1
        ? 'workspace'
        : null

  return { info, loading, error, refresh, multiRepoLabel }
}
