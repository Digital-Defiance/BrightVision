import { useCallback, useState } from 'react'
import { readWorkspaceTextFile, writeWorkspaceTextFile } from '../ipc/workspaceEditor'

export interface EditorTab {
  path: string
  content: string
  savedContent: string
  dirty: boolean
  loading?: boolean
  error?: string
}

export function useEditorSession(workingDir: string) {
  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const activeTab = tabs.find((t) => t.path === activePath) ?? null

  const openFile = useCallback(
    async (path: string) => {
      const normalized = path.replace(/\\/g, '/').trim()
      if (!normalized) return
      const existing = tabs.find((t) => t.path === normalized)
      if (existing) {
        setActivePath(normalized)
        return
      }
      setTabs((prev) => [
        ...prev,
        { path: normalized, content: '', savedContent: '', dirty: false, loading: true },
      ])
      setActivePath(normalized)
      try {
        const content = await readWorkspaceTextFile(workingDir, normalized)
        setTabs((prev) =>
          prev.map((t) =>
            t.path === normalized
              ? { ...t, content, savedContent: content, dirty: false, loading: false, error: undefined }
              : t
          )
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setTabs((prev) =>
          prev.map((t) =>
            t.path === normalized ? { ...t, loading: false, error: message } : t
          )
        )
      }
    },
    [workingDir]
  )

  const closeTab = useCallback(
    (path: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.path !== path)
        if (activePath === path) {
          const idx = prev.findIndex((t) => t.path === path)
          const fallback = next[Math.min(idx, next.length - 1)]
          setActivePath(fallback?.path ?? null)
        }
        return next
      })
    },
    [activePath]
  )

  const setTabContent = useCallback((path: string, content: string) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.path === path
          ? { ...t, content, dirty: content !== t.savedContent }
          : t
      )
    )
  }, [])

  const saveTab = useCallback(
    async (path: string) => {
      const tab = tabs.find((t) => t.path === path)
      if (!tab || tab.loading) return false
      setBusy(true)
      try {
        await writeWorkspaceTextFile(workingDir, path, tab.content)
        setTabs((prev) =>
          prev.map((t) =>
            t.path === path
              ? { ...t, savedContent: t.content, dirty: false, error: undefined }
              : t
          )
        )
        return true
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setTabs((prev) =>
          prev.map((t) => (t.path === path ? { ...t, error: message } : t))
        )
        return false
      } finally {
        setBusy(false)
      }
    },
    [workingDir, tabs]
  )

  const saveActive = useCallback(async () => {
    if (!activePath) return false
    return saveTab(activePath)
  }, [activePath, saveTab])

  return {
    tabs,
    activePath,
    activeTab,
    busy,
    setActivePath,
    openFile,
    closeTab,
    setTabContent,
    saveTab,
    saveActive,
  }
}
