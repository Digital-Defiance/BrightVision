import { useCallback, useEffect, useState } from 'react'
import { fetchGitWorkspaceStatus, type GitWorkspaceStatus } from '../ipc/gitStatus'
import { isTauriRuntime } from '../ipc/isTauri'

/** Git status poll interval while session runs, Git tab, or Editor explorer is open (#26/#38). */
export const GIT_STATUS_POLL_MS = 8_000
const POLL_MS = GIT_STATUS_POLL_MS

export function useGitStatus(
  workingDir: string,
  refreshKey: number,
  pollWhileRunning: boolean,
  pollWhileGitTab = false,
  pollWhileEditorTab = false
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
    if ((!pollWhileRunning && !pollWhileGitTab && !pollWhileEditorTab) || !isTauriRuntime()) {
      return
    }
    const id = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(id)
  }, [pollWhileRunning, pollWhileGitTab, pollWhileEditorTab, refresh])

  return { status, loading, refresh }
}
