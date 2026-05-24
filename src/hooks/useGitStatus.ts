import { useCallback, useEffect, useState } from 'react'
import { fetchGitWorkspaceStatus, type GitWorkspaceStatus } from '../ipc/gitStatus'
import { isTauriRuntime } from '../ipc/isTauri'

const POLL_MS = 8_000

export function useGitStatus(workingDir: string, refreshKey: number, pollWhileRunning: boolean) {
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
    if (!pollWhileRunning || !isTauriRuntime()) return
    const id = window.setInterval(() => void refresh(), POLL_MS)
    return () => window.clearInterval(id)
  }, [pollWhileRunning, refresh])

  return { status, loading, refresh }
}
