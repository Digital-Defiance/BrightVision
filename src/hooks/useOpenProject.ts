import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  loadCurrentProject,
  loadRecentProjects,
  projectDisplayName,
  recordRecentProject,
  saveCurrentProject,
  shouldSkipProjectGate,
} from '../ipc/openProject'
import { isTauriRuntime } from '../ipc/isTauri'
import { normalizeWorkspacePath } from '../utils/workspacePath'

export interface UseOpenProjectOptions {
  /** Fallback when nothing stored yet (legacy config). */
  fallbackPath: string
  onProjectOpened: (path: string) => void
  isSessionActive: boolean
  stopSession?: () => Promise<void>
}

export function useOpenProject({
  fallbackPath,
  onProjectOpened,
  isSessionActive,
  stopSession,
}: UseOpenProjectOptions) {
  const skipGate = shouldSkipProjectGate()
  const autoCommittedRef = useRef(false)
  const [gateOpen, setGateOpen] = useState(!skipGate)
  const [recents, setRecents] = useState<string[]>(() => loadRecentProjects())
  const [selectedPath, setSelectedPath] = useState(
    () => loadCurrentProject() || normalizeWorkspacePath(fallbackPath)
  )
  const [suggestedPath, setSuggestedPath] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    if (!isTauriRuntime()) return
    void invoke<string>('detect_workspace', {
      hint: loadCurrentProject() || fallbackPath || null,
    })
      .then((dir) => {
        const normalized = normalizeWorkspacePath(dir)
        setSuggestedPath(normalized)
        if (!loadCurrentProject()) setSelectedPath(normalized)
      })
      .catch(() => {})
  }, [fallbackPath])

  const commitOpen = useCallback(
    async (path: string) => {
      const normalized = normalizeWorkspacePath(path.trim())
      if (!normalized || normalized === '.') return
      setOpening(true)
      try {
        if (isSessionActive && stopSession) {
          await stopSession()
        }
        saveCurrentProject(normalized)
        setRecents(recordRecentProject(normalized))
        onProjectOpened(normalized)
        setGateOpen(false)
      } finally {
        setOpening(false)
      }
    },
    [isSessionActive, onProjectOpened, stopSession]
  )

  useEffect(() => {
    if (!skipGate || autoCommittedRef.current) return
    const path = loadCurrentProject() || normalizeWorkspacePath(fallbackPath)
    if (!path || path === '.') return
    autoCommittedRef.current = true
    onProjectOpened(path)
    setGateOpen(false)
  }, [skipGate, fallbackPath, onProjectOpened])

  const pickFolder = useCallback(async (): Promise<string | null> => {
    if (!isTauriRuntime()) return null
    try {
      const selected = await invoke<string | null>('pick_workspace_folder')
      if (!selected) return null
      const normalized = normalizeWorkspacePath(selected)
      setSelectedPath(normalized)
      return normalized
    } catch {
      return null
    }
  }, [])

  const showProjectPicker = useCallback(() => {
    const current = loadCurrentProject()
    if (current) setSelectedPath(current)
    setRecents(loadRecentProjects())
    setGateOpen(true)
  }, [])

  const currentProject = gateOpen ? null : loadCurrentProject() || normalizeWorkspacePath(fallbackPath)

  return {
    gateOpen,
    selectedPath,
    setSelectedPath,
    recents,
    suggestedPath,
    opening,
    commitOpen,
    pickFolder,
    showProjectPicker,
    currentProject,
    projectLabel: currentProject ? projectDisplayName(currentProject) : '',
    skipGate,
  }
}
