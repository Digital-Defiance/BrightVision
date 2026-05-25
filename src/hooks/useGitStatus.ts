import { useCallback, useEffect, useState } from 'react'
import { fetchGitWorkspaceStatus, type GitWorkspaceStatus } from '../ipc/gitStatus'
import { isTauriRuntime } from '../ipc/isTauri'

/** Git status poll interval while session runs or Git tab is open (roadmap #26 partial). */
export const GIT_STATUS_POLL_MS = 8_000
const POLL_MS = GIT_STATUS_POLL_MS

export function useGitStatus(
  workingDir: string,
  refreshKey: number,
  pollWhileRunning: boolean,
  pollWhileGitTab = false
) {
  const [status, setStatus] = useState<GitWorkspaceStatus | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!isTauriRuntime()) {
      setStatus(null)
      return
    }
    setLoading(true)
    try {
      const next = await fetchGitWorkspaceStatus(workingDir)
      setStatus(next)
    } finally {
      setLoading(false)
    }
  }, [workingDir])

  useEffect(() => {
    void refresh()
  }, [refresh, refreshKey])

  useEffect(() => {
    if ((!pollWhileRunning && !pollWhileGitTab) || !isTauriRuntime()) return
    const id = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(id)
  }, [pollWhileRunning, pollWhileGitTab, refresh])

  return { status, loading, refresh }
}
