import { useCallback, useState } from 'react'
import type { CoreConfirmEvent, CoreDoneEvent } from '../ipc/events'
import { isCoreEvent, type CoreEventBase } from '../ipc/events'

export interface GitActivity {
  editedFiles: string[]
  commitHash?: string
  commitMessage?: string
}

export function useSessionActivity() {
  const [pendingConfirm, setPendingConfirm] = useState<CoreConfirmEvent | null>(null)
  const [lastGit, setLastGit] = useState<GitActivity | null>(null)
  const [filesInChat, setFilesInChat] = useState<string[]>([])

  const ingestEvent = useCallback((ev: CoreEventBase) => {
    if (ev.type === 'done') {
      const d = ev as CoreDoneEvent
      setPendingConfirm(null)
      setLastGit({
        editedFiles: (d.edited_files as string[]) ?? [],
        commitHash: d.commit_hash as string | undefined,
        commitMessage: d.commit_message as string | undefined,
      })
    }
  }, [])

  const wrapHandler = useCallback(
    (handler: (ev: CoreEventBase) => void) => (raw: unknown) => {
      if (!isCoreEvent(raw)) return
      ingestEvent(raw)
      handler(raw)
    },
    [ingestEvent]
  )

  return {
    pendingConfirm,
    setPendingConfirm,
    dismissConfirm: () => setPendingConfirm(null),
    lastGit,
    filesInChat,
    setFilesInChat,
    wrapHandler,
  }
}
