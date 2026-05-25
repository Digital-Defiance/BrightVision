import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import ChatIcon from '@mui/icons-material/Chat'
import ChecklistRtlIcon from '@mui/icons-material/ChecklistRtl'
import GitHubIcon from '@mui/icons-material/GitHub'
import SettingsIcon from '@mui/icons-material/Settings'
import TerminalIcon from '@mui/icons-material/Terminal'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import { Alert, Box, Button, Chip, Container, Paper, Snackbar, Stack, Typography } from '@mui/material'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { DISPLAY_CORE, ErrorSource, prefixForTechnicalLog, prefixForUserFacing } from './brand'
import { AppChrome } from './components/layout/AppChrome'
import { DEFAULT_CONFIG, defaultCoreApiUrl, type AiderConfig } from './ipc/config'
import { type CoreConfirmEvent, type CoreEventBase } from './ipc/events'
import {
  appendStreamingToken,
  capList,
  MAX_CHAT_MESSAGES,
  MAX_TERMINAL_LINES,
  MAX_TOOL_EVENTS,
  parseTokenUsage,
  popPendingUserMessageId,
  reconcileUserMessageInChat,
  removeChatMessageById,
  shiftPendingUserMessageId,
} from './utils/chatStream'
import { isTauriRuntime } from './ipc/isTauri'
import { CoreHttpClient } from './ipc/httpClient'
import { useAiderSession } from './hooks/useAiderSession'
import { usePathCompletion } from './hooks/usePathCompletion'
import { filesToUploadParts } from './utils/imageUpload'
import { buildImplementStepMessage, buildStartWorkMessage } from './todos/formatContext'
import type { ImplementationStep } from './todos/tasksMd'
import type { TodoItem } from './todos/types'
import { useCommandCatalog } from './hooks/useCommandCatalog'
import { useGitStatus } from './hooks/useGitStatus'
import { autoStageEditedFiles } from './ipc/gitStatus'
import { useSessionActivity } from './hooks/useSessionActivity'
import { ChatPanel, type ChatMessage, type ToolEvent } from './components/chat/ChatPanel'
import { TodoPanel } from './components/todos/TodoPanel'
import { GitPanel } from './components/GitPanel'
import { useWorkspaceTodos } from './hooks/useWorkspaceTodos'
import { WelcomePanel } from './components/onboarding/WelcomePanel'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { ProcessProvider } from './progress/processStore'
import { useProcess } from './progress/processStore'
import { isSessionLifecycleActive } from './utils/sessionLifecycle'
import {
  applyAppearanceCssVars,
  DEFAULT_APPEARANCE,
  loadAppearance,
  resolveAppearanceFonts,
  saveAppearance,
  type AppearanceConfig,
} from './theme/appearance'
import { createVisionTheme } from './theme'

const WELCOME_DISMISSED_KEY = 'vision-welcome-dismissed'

type TabId = 'chat' | 'terminal' | 'git' | 'settings' | 'tasks'

function migrateConfig(raw: Partial<AiderConfig> & Record<string, unknown>): AiderConfig {
  const merged: AiderConfig = { ...DEFAULT_CONFIG, ...raw }
  if (raw.coreRepoPath && typeof raw.coreRepoPath === 'string') {
    merged.coreEnginePath = raw.coreRepoPath
  }
  if (!Array.isArray(merged.contextFiles)) {
    merged.contextFiles = []
  }
  if (typeof merged.promptBeforeCommit !== 'boolean') {
    merged.promptBeforeCommit = false
  }
  if (typeof merged.autoStageOnDone !== 'boolean') {
    merged.autoStageOnDone = true
  }
  if (!merged.coreApiUrl || merged.coreApiUrl === DEFAULT_CONFIG.coreApiUrl) {
    if (!isTauriRuntime()) merged.coreApiUrl = defaultCoreApiUrl()
  }
  const wd = merged.workingDir.replace(/\\/g, '/')
  if (wd.endsWith('/src-tauri') || wd.endsWith('src-tauri')) {
    merged.workingDir = wd.replace(/\/?src-tauri\/?$/, '') || '.'
  }
  return merged
}

interface TerminalLine {
  id: number
  text: string
  type: 'stdout' | 'stderr'
  source?: ErrorSource
  channel?: 'user' | 'technical'
}

const NAV: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: 'chat', label: 'Chat', icon: <ChatIcon /> },
  { id: 'tasks', label: 'Tasks', icon: <ChecklistRtlIcon /> },
  { id: 'terminal', label: 'Terminal', icon: <TerminalIcon /> },
  { id: 'git', label: 'Git', icon: <GitHubIcon /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
]

function AppShell({
  appearance,
  setAppearance,
}: {
  appearance: AppearanceConfig
  setAppearance: React.Dispatch<React.SetStateAction<AppearanceConfig>>
}) {
  const [activeTab, setActiveTab] = useState<TabId>('chat')
  const [config, setConfig] = useState<AiderConfig>(DEFAULT_CONFIG)
  const [savedConfig, setSavedConfig] = useState<AiderConfig>(DEFAULT_CONFIG)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([])
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([])
  const [inputValue, setInputValue] = useState('')
  const [remainingAutoApproves, setRemainingAutoApproves] = useState(0)
  const [tokenStats, setTokenStats] = useState<string | null>(null)
  const submitConfirmRef = useRef<(confirmId: string, answer: boolean) => Promise<void>>(
    async () => {}
  )
  const setPendingConfirmRef = useRef<(c: CoreConfirmEvent | null) => void>(() => {})
  const remainingAutoRef = useRef(0)
  remainingAutoRef.current = remainingAutoApproves
  const [statusMessage, setStatusMessage] = useState('')
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'error' | 'info' } | null>(
    null
  )
  const [showWelcome, setShowWelcome] = useState(
    () => localStorage.getItem(WELCOME_DISMISSED_KEY) !== '1'
  )
  const [engineInstallPath, setEngineInstallPath] = useState<string | undefined>()
  const [gitRefreshKey, setGitRefreshKey] = useState(0)
  const [specGenerating, setSpecGenerating] = useState(false)
  const specGenerateAbortRef = useRef<AbortController | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const terminalEndRef = useRef<HTMLDivElement>(null)
  const streamingAssistantId = useRef<number | null>(null)
  const pendingUserMessageIdsRef = useRef<number[]>([])
  const chatMessageIdSeqRef = useRef(0)
  const todoInjectedIdRef = useRef<string | null>(null)
  const recordTurnLinksRef = useRef<(links: string[]) => void | Promise<void>>(async () => {})
  const reloadTodosRef = useRef<() => void | Promise<void>>(async () => {})
  const savedConfigRef = useRef(savedConfig)
  savedConfigRef.current = savedConfig
  const unlistenersRef = useRef<UnlistenFn[]>([])

  useEffect(() => {
    const stored = localStorage.getItem('aider-vision-config')
    let merged = DEFAULT_CONFIG
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<AiderConfig> & Record<string, unknown>
        merged = migrateConfig(parsed)
      } catch (e) {
        console.error('Failed to parse stored config', e)
      }
    }
    const apply = (cfg: AiderConfig) => {
      setConfig(cfg)
      setSavedConfig(cfg)
    }
    if (isTauriRuntime()) {
      Promise.all([
        invoke<string>('detect_workspace', { hint: merged.workingDir || null }),
        merged.pythonPath.trim()
          ? Promise.resolve(merged.pythonPath)
          : invoke<string>('default_python_path'),
      ])
        .then(([dir, pythonPath]) => {
          const next = {
            ...merged,
            workingDir: dir,
            pythonPath: merged.pythonPath.trim() || pythonPath,
          }
          if (dir !== merged.workingDir || next.pythonPath !== merged.pythonPath) {
            setSavedConfig(next)
            localStorage.setItem('aider-vision-config', JSON.stringify(next))
          }
          apply(next)
        })
        .catch(() => apply(merged))
    } else {
      apply(merged)
    }
  }, [])

  useEffect(() => {
    if (!isTauriRuntime()) return
    invoke<string>('engine_install_path', { coreEnginePath: savedConfig.coreEnginePath })
      .then(setEngineInstallPath)
      .catch(() => setEngineInstallPath(undefined))
  }, [savedConfig.coreEnginePath])

  useEffect(() => {
    if (!isTauriRuntime()) return
    void invoke('stop_core_api').catch(() => {})
    return () => {
      void invoke('stop_core_api').catch(() => {})
    }
  }, [])

  const dismissWelcome = useCallback(() => {
    setShowWelcome(false)
    localStorage.setItem(WELCOME_DISMISSED_KEY, '1')
  }, [])

  const handleChooseProject = useCallback(async () => {
    if (!isTauriRuntime()) return
    try {
      const selected = await invoke<string | null>('pick_workspace_folder')
      if (!selected) return
      const next = { ...config, workingDir: selected }
      setConfig(next)
      setSavedConfig(next)
      localStorage.setItem('aider-vision-config', JSON.stringify(next))
      setSnackbar({ message: 'Project folder updated', severity: 'info' })
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      })
    }
  }, [config])

  const appendStderr = useCallback((payload: string) => {
    const trimmed = payload.trim()
    if (
      !trimmed ||
      trimmed.includes('\r') ||
      /Scanning repo:\s*\d+%/.test(trimmed) ||
      /\d+it\/s\]/.test(trimmed)
    ) {
      return
    }
    const id = Date.now()
    setTerminalLines((prev) => [
      ...prev,
      {
        id,
        text: `${prefixForUserFacing('core')} ${payload}`,
        type: 'stderr',
        source: 'core',
        channel: 'user',
      },
      {
        id: id + 1,
        text: `${prefixForTechnicalLog()} ${payload}`,
        type: 'stderr',
        source: 'core',
        channel: 'technical',
      },
    ])
    setChatMessages((chatPrev) => [
      ...chatPrev,
      {
        id,
        role: 'system',
        content: `${prefixForUserFacing('core')} ${payload}`,
      },
    ])
  }, [])

  const process = useProcess()

  const bumpGitRefresh = useCallback(() => {
    setGitRefreshKey((k) => k + 1)
  }, [])

  const nextChatMessageId = useCallback(
    () => Date.now() + ++chatMessageIdSeqRef.current,
    []
  )

  const appendUserMessageToChat = useCallback(
    (content: string, trackPending: boolean) => {
      const id = nextChatMessageId()
      if (trackPending) pendingUserMessageIdsRef.current.push(id)
      setChatMessages((prev) =>
        capList([...prev, { id, role: 'user' as const, content }], MAX_CHAT_MESSAGES)
      )
    },
    [nextChatMessageId]
  )

  const removeLastPendingUserMessage = useCallback(() => {
    const id = popPendingUserMessageId(pendingUserMessageIdsRef.current)
    setChatMessages((prev) => removeChatMessageById(prev, id))
  }, [])

  const handleCoreEvent = useCallback((ev: CoreEventBase) => {
    process.ingestCoreEvent(ev)
    if (ev.type === 'done') bumpGitRefresh()
    const orderId = nextChatMessageId()

    switch (ev.type) {
      case 'user_message': {
        streamingAssistantId.current = null
        const serverText = String(ev.text ?? '')
        const pendingId = shiftPendingUserMessageId(pendingUserMessageIdsRef.current)
        setChatMessages((prev) =>
          capList(
            reconcileUserMessageInChat(
              prev,
              pendingId,
              serverText,
              (id, content) => ({ id, role: 'user' as const, content }),
              nextChatMessageId
            ),
            MAX_CHAT_MESSAGES
          )
        )
        break
      }
      case 'token': {
        const chunk = String(ev.text ?? '')
        if (!chunk) break
        let sid = streamingAssistantId.current
        if (sid === null) {
          sid = orderId
          streamingAssistantId.current = sid
          setChatMessages((prev) =>
            capList([...prev, { id: sid!, role: 'assistant' as const, content: chunk }], MAX_CHAT_MESSAGES)
          )
        } else {
          const captureSid = sid
          setChatMessages((prev) =>
            capList(
              prev.map((m) =>
                m.id === captureSid
                  ? { ...m, content: appendStreamingToken(m.content, chunk) }
                  : m
              ),
              MAX_CHAT_MESSAGES
            )
          )
        }
        break
      }
      case 'progress':
        break
      case 'tool_output': {
        const text = String(ev.text ?? '')
        const usage = parseTokenUsage(text)
        if (usage) {
          setTokenStats(usage)
          break
        }
        if (!text.trim()) break
        streamingAssistantId.current = null
        setToolEvents((prev) =>
          capList(
            [
              ...prev,
              {
                id: orderId,
                type: 'tool_result' as const,
                name: 'output',
                output: text,
              },
            ],
            MAX_TOOL_EVENTS
          )
        )
        setTerminalLines((prev) =>
          capList([...prev, { id: orderId, text, type: 'stdout' as const }], MAX_TERMINAL_LINES)
        )
        break
      }
      case 'tool_error': {
        const text = String(ev.text ?? '')
        if (!text.trim()) break
        streamingAssistantId.current = null
        setToolEvents((prev) =>
          capList(
            [...prev, { id: orderId, type: 'tool_result' as const, name: 'error', output: text }],
            MAX_TOOL_EVENTS
          )
        )
        break
      }
      case 'tool_warning': {
        const text = String(ev.text ?? '')
        if (!text.trim()) break
        streamingAssistantId.current = null
        setToolEvents((prev) =>
          capList(
            [
              ...prev,
              { id: orderId, type: 'tool_warning' as const, name: 'warning', output: text },
            ],
            MAX_TOOL_EVENTS
          )
        )
        break
      }
      case 'confirm': {
        const c = ev as CoreConfirmEvent
        setTerminalLines((prev) =>
          capList(
            [
              ...prev,
              {
                id: orderId,
                text: `[confirm] ${c.question ?? ''}${c.auto_answered ? ' (auto)' : ''}`,
                type: 'stdout' as const,
              },
            ],
            MAX_TERMINAL_LINES
          )
        )
        if (c.auto_answered || !c.confirm_id) break
        if (remainingAutoRef.current > 0) {
          void submitConfirmRef.current(c.confirm_id, true).then(() => {
            setRemainingAutoApproves((p) => Math.max(0, p - 1))
          })
        } else {
          setPendingConfirmRef.current(c)
        }
        break
      }
      case 'assistant_complete':
        break
      case 'done': {
        const applied =
          ev.edited_files && Array.isArray(ev.edited_files)
            ? (ev.edited_files as string[])
            : []
        streamingAssistantId.current = null
        setStatusMessage('Ready')
        if (applied.length > 0) {
          setChatMessages((prev) => {
            let lastAssistantId: number | null = null
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].role === 'assistant') {
                lastAssistantId = prev[i].id
                break
              }
            }
            if (lastAssistantId === null) return prev
            return capList(
              prev.map((m) =>
                m.id === lastAssistantId ? { ...m, appliedFiles: applied } : m
              ),
              MAX_CHAT_MESSAGES
            )
          })
        }
        if (applied.length > 0) {
          setTerminalLines((prev) => [
            ...prev,
            {
              id: orderId,
              text: `Edited: ${applied.join(', ')}`,
              type: 'stdout',
            },
          ])
        }
        if (ev.commit_hash) {
          setTerminalLines((prev) => [
            ...prev,
            {
              id: orderId + 1,
              text: `Commit ${ev.commit_hash}: ${ev.commit_message ?? ''}`,
              type: 'stdout',
            },
          ])
        }
        {
          const links: string[] = [...applied]
          if (ev.commit_hash) links.push(`commit:${String(ev.commit_hash)}`)
          if (links.length) {
            void recordTurnLinksRef.current(links)
            void reloadTodosRef.current()
          }
        }
        if (applied.length > 0) {
          const cfg = savedConfigRef.current
          void autoStageEditedFiles(cfg.workingDir, applied, {
            enabled: cfg.autoStageOnDone,
            engineCommitted: Boolean(ev.commit_hash),
          })
            .then((n) => {
              if (n > 0) {
                bumpGitRefresh()
                setSnackbar({
                  message: `Staged ${n} edited file${n === 1 ? '' : 's'} for review`,
                  severity: 'info',
                })
              }
            })
            .catch((err) => {
              setSnackbar({
                message: err instanceof Error ? err.message : String(err),
                severity: 'error',
              })
            })
        }
        break
      }
      case 'error':
        streamingAssistantId.current = null
        setTerminalLines((prev) => [
          ...prev,
          {
            id: orderId,
            text: `${prefixForUserFacing('core')} ${ev.text ?? 'Unknown error'}`,
            type: 'stderr',
            source: 'core',
            channel: 'user',
          },
        ])
        setChatMessages((prev) => [
          ...prev,
          {
            id: orderId,
            role: 'system',
            content: `${prefixForUserFacing('core')} ${ev.text ?? 'Unknown error'}`,
          },
        ])
        break
      default:
        setTerminalLines((prev) => [
          ...prev,
          { id: orderId, text: JSON.stringify(ev), type: 'stdout' },
        ])
    }
  }, [process, bumpGitRefresh, nextChatMessageId])

  const { pendingConfirm, setPendingConfirm, dismissConfirm, lastGit, setFilesInChat, wrapHandler } =
    useSessionActivity()
  const {
    isRunning,
    isStarting,
    isBusy,
    queuedCount,
    sessionInfo,
    httpClient,
    start,
    stop,
    send,
    cancelSend,
    submitConfirm,
    addFiles,
    uploadFiles,
    undo,
  } = useAiderSession(wrapHandler(handleCoreEvent))

  const lifecycleActive = isSessionLifecycleActive(
    process.snapshot,
    isRunning,
    isStarting
  )

  const todoApiClient = useMemo(
    () => new CoreHttpClient(savedConfig.coreApiUrl, savedConfig.coreApiToken || undefined),
    [savedConfig.coreApiUrl, savedConfig.coreApiToken]
  )

  const workspaceTodosApi = useMemo(
    () => ({
      client: httpClient ?? todoApiClient,
      workspace: savedConfig.workingDir,
    }),
    [httpClient, todoApiClient, savedConfig.workingDir]
  )

  const { paths: pathSuggestions, active: pathAssistActive } = usePathCompletion(
    savedConfig.workingDir,
    inputValue
  )
  const {
    store: todoStore,
    loading: todosLoading,
    activeTodo,
    createTodo,
    updateTodo,
    deleteTodo,
    moveTodo,
    syncSpecFromDisk,
    setActiveTodo,
    markDone,
    recordTurnLinks,
    reload: reloadTodos,
    exportMarkdown,
    importMarkdown,
    httpReady: todosHttpReady,
    tauriLocal: todosTauriLocal,
  } = useWorkspaceTodos(savedConfig.workingDir, workspaceTodosApi, () => {
      setSnackbar({
        message: 'Task marked done — all checklist items complete',
        severity: 'info',
      })
      void reloadTodos()
    }
  )

  recordTurnLinksRef.current = recordTurnLinks
  reloadTodosRef.current = reloadTodos

  useEffect(() => {
    if (!activeTodo) todoInjectedIdRef.current = null
  }, [activeTodo?.id])

  useEffect(() => {
    if (activeTab === 'tasks') void reloadTodos()
  }, [activeTab, reloadTodos])

  useEffect(() => {
    void reloadTodos()
  }, [savedConfig.workingDir, reloadTodos])

  submitConfirmRef.current = submitConfirm
  setPendingConfirmRef.current = setPendingConfirm
  const { commands } = useCommandCatalog(httpClient, sessionInfo?.session_id ?? null)
  const {
    status: gitStatus,
    loading: gitLoading,
    refresh: refreshGit,
  } = useGitStatus(savedConfig.workingDir, gitRefreshKey, isRunning, activeTab === 'git')

  useEffect(() => {
    if (!isTauriRuntime()) return
    const setup = async () => {
      unlistenersRef.current.push(
        await listen<string>('aider-error', (event) => appendStderr(event.payload))
      )
    }
    setup()
    return () => {
      unlistenersRef.current.forEach((fn) => fn())
      unlistenersRef.current = []
    }
  }, [appendStderr])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLines])

  const handleSave = () => {
    setSavedConfig(config)
    localStorage.setItem('aider-vision-config', JSON.stringify(config))
    saveAppearance(appearance)
    setSnackbar({ message: 'Settings saved', severity: 'info' })
  }

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG)
    setSavedConfig(DEFAULT_CONFIG)
    localStorage.removeItem('aider-vision-config')
    setAppearance({ ...DEFAULT_APPEARANCE })
    localStorage.removeItem('aider-vision-appearance')
    applyAppearanceCssVars(DEFAULT_APPEARANCE)
  }

  const handleStart = async () => {
    if (lifecycleActive) {
      await stop()
      process.idle()
    }
    try {
      const { info, workingDir } = await start(savedConfig)
      if (workingDir !== savedConfig.workingDir) {
        const next = { ...savedConfig, workingDir }
        setSavedConfig(next)
        setConfig(next)
        localStorage.setItem('aider-vision-config', JSON.stringify(next))
      }
      setFilesInChat(info.files_in_chat ?? [])
      setRemainingAutoApproves(savedConfig.autoApproveLimit)
      todoInjectedIdRef.current = null
      streamingAssistantId.current = null
      pendingUserMessageIdsRef.current = []
      setChatMessages([])
      setToolEvents([])
      setTerminalLines([
        {
          id: Date.now(),
          text: `${prefixForUserFacing('vision')} Started ${DISPLAY_CORE} (session ${info.session_id.slice(0, 8)}…).`,
          type: 'stdout',
          source: 'vision',
        },
      ])
      const files = info.files_in_chat?.length ? info.files_in_chat.join(', ') : '(repo map)'
      setStatusMessage(`Session active — ${files}`)
      dismissWelcome()
      setActiveTab('chat')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(err)
      setSnackbar({ message: `Could not start: ${msg}`, severity: 'error' })
      setTerminalLines((prev) => [
        ...prev,
        {
          id: Date.now(),
          text: `${prefixForUserFacing('vision')} Could not start: ${msg}`,
          type: 'stderr',
          source: 'vision',
        },
      ])
    }
  }

  const handleStop = async () => {
    try {
      await stop()
      process.idle()
      setFilesInChat([])
      setRemainingAutoApproves(0)
      setTerminalLines((prev) => [
        ...prev,
        {
          id: Date.now(),
          text: `${prefixForUserFacing('vision')} Stopped ${DISPLAY_CORE}.`,
          type: 'stdout',
          source: 'vision',
        },
      ])
      setStatusMessage('Stopped')
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      })
    }
  }

  const handleNativeAttachImages = useCallback(async () => {
    if (!isRunning) return
    try {
      const paths = await invoke<string[]>('pick_and_stage_chat_images', {
        workingDir: savedConfig.workingDir,
      })
      if (!paths.length) return
      const info = await addFiles(paths)
      setFilesInChat(info.files_in_chat)
      setSnackbar({
        message: `Attached ${paths.length} file${paths.length === 1 ? '' : 's'} to the session`,
        severity: 'info',
      })
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      })
    }
  }, [isRunning, savedConfig.workingDir, addFiles, setFilesInChat])

  const handleAttachFiles = useCallback(
    async (files: FileList) => {
      if (!isRunning) return
      try {
        const parts = await filesToUploadParts(files)
        if (!parts.length) {
          setSnackbar({
            message: 'Choose PNG, JPEG, GIF, WebP, TIFF, or PDF files',
            severity: 'error',
          })
          return
        }
        const info = await uploadFiles(parts)
        setFilesInChat(info.files_in_chat)
        setSnackbar({
          message: `Attached ${parts.length} file${parts.length === 1 ? '' : 's'} to the session`,
          severity: 'info',
        })
      } catch (err) {
        setSnackbar({
          message: err instanceof Error ? err.message : String(err),
          severity: 'error',
        })
      }
    },
    [isRunning, uploadFiles, setFilesInChat]
  )

  const handleAttachTerminalTail = useCallback(() => {
    if (!isRunning) return
    const lines = terminalLines
      .slice(-40)
      .map((l) => l.text)
      .join('\n')
      .trim()
    if (!lines) {
      setSnackbar({ message: 'No terminal output to attach', severity: 'info' })
      return
    }
    const block = `[Terminal output]\n\`\`\`\n${lines}\n\`\`\`\n\n`
    setInputValue((prev) => (prev.endsWith('\n') || !prev ? prev + block : `${prev}\n\n${block}`))
  }, [isRunning, terminalLines])

  const handleAttachContextDirectory = useCallback(async () => {
    if (!isRunning || !isTauriRuntime()) return
    try {
      const picked = await invoke<string | null>('pick_context_directory', {
        workingDir: savedConfig.workingDir,
      })
      if (!picked) return
      const info = await addFiles([picked])
      setFilesInChat(info.files_in_chat)
      setSnackbar({ message: 'Folder added to session context', severity: 'info' })
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      })
    }
  }, [isRunning, savedConfig.workingDir, addFiles, setFilesInChat])

  const handleAttachFolderPath = useCallback(
    async (relativePath: string) => {
      if (!isRunning) return
      const path = relativePath.trim().replace(/\\/g, '/').replace(/^\.\//, '')
      if (!path) return
      try {
        const info = await addFiles([path])
        setFilesInChat(info.files_in_chat)
        setSnackbar({ message: `Added folder ${path} to session context`, severity: 'info' })
      } catch (err) {
        setSnackbar({
          message: err instanceof Error ? err.message : String(err),
          severity: 'error',
        })
      }
    },
    [isRunning, addFiles, setFilesInChat]
  )

  const handleStartWork = useCallback(
    async (todo: TodoItem) => {
      await setActiveTodo(todo.id)
      await updateTodo(todo.id, {
        title: todo.title,
        spec: todo.spec,
        requirements: todo.requirements,
        design: todo.design,
        tasks_md: todo.tasks_md,
        depends_on: todo.depends_on,
        branch: todo.branch,
        pr_url: todo.pr_url,
        checklist: todo.checklist,
      })
      todoInjectedIdRef.current = null
      setActiveTab('chat')
      setInputValue(buildStartWorkMessage(todo, todoStore?.todos ?? []))
      setSnackbar({ message: `Active task: ${todo.title}`, severity: 'info' })
    },
    [setActiveTodo, updateTodo, todoStore?.todos]
  )

  const handleGenerateSpec = useCallback(
    async (todoId: string, prompt: string, mode: 'generate' | 'refine') => {
      const sid = sessionInfo?.session_id
      const client = httpClient ?? todoApiClient
      if (!sid || !isRunning) {
        setSnackbar({ message: 'Start a session to generate specs with AI', severity: 'info' })
        return
      }
      specGenerateAbortRef.current?.abort()
      const ac = new AbortController()
      specGenerateAbortRef.current = ac
      setSpecGenerating(true)
      setSnackbar({
        message: 'Generating spec in background — chat stays available',
        severity: 'info',
      })
      try {
        await client.generateWorkspaceTodoSpec(
          savedConfig.workingDir,
          sid,
          todoId,
          { prompt, mode, apply: true, background: true },
          ac.signal
        )
        await reloadTodos()
        setSnackbar({
          message: mode === 'refine' ? 'Spec refined and saved' : 'Spec generated and saved',
          severity: 'info',
        })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setSnackbar({
          message: err instanceof Error ? err.message : String(err),
          severity: 'error',
        })
        throw err
      } finally {
        if (specGenerateAbortRef.current === ac) {
          specGenerateAbortRef.current = null
        }
        setSpecGenerating(false)
      }
    },
    [sessionInfo?.session_id, httpClient, todoApiClient, isRunning, savedConfig.workingDir, reloadTodos]
  )

  const handleImplementStep = useCallback(
    async (todo: TodoItem, step: ImplementationStep) => {
      await setActiveTodo(todo.id)
      await updateTodo(todo.id, {
        title: todo.title,
        requirements: todo.requirements,
        design: todo.design,
        tasks_md: todo.tasks_md,
        depends_on: todo.depends_on,
        branch: todo.branch,
        pr_url: todo.pr_url,
        checklist: todo.checklist,
      })
      todoInjectedIdRef.current = null
      setActiveTab('chat')
      setInputValue(buildImplementStepMessage(step, todo))
      setSnackbar({
        message: `Implementing step ${step.number}: ${step.text}`,
        severity: 'info',
      })
    },
    [setActiveTodo, updateTodo]
  )

  const handleSend = async () => {
    if (!inputValue.trim() || !isRunning) return
    const text = inputValue.trim()
    setInputValue('')
    appendUserMessageToChat(text, true)
    const injectSpec = Boolean(activeTodo && todoInjectedIdRef.current !== activeTodo.id)
    const todoOptions = activeTodo
      ? { activeTodoId: activeTodo.id, injectTodoSpec: injectSpec }
      : undefined
    try {
      const result = await send(text, todoOptions)
      if (injectSpec && activeTodo) todoInjectedIdRef.current = activeTodo.id
      if (result.queued) {
        setSnackbar({
          message: 'Queued — will send when the agent finishes the current turn',
          severity: 'info',
        })
      } else {
        void reloadTodos()
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setStatusMessage('Stopped')
        return
      }
      removeLastPendingUserMessage()
      setInputValue(text)
      setSnackbar({
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      })
    }
  }

  const handleConfirmAnswer = async (accepted: boolean) => {
    const c = pendingConfirm
    if (!c?.confirm_id) return
    try {
      await submitConfirm(c.confirm_id, accepted)
      dismissConfirm()
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      })
    }
  }

  const handleDismissMessage = (messageId: number) => {
    setChatMessages((prev) => prev.filter((m) => m.id !== messageId))
  }

  const handleUndo = async () => {
    try {
      await undo()
      bumpGitRefresh()
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      })
    }
  }

  const apiPreview = `POST ${savedConfig.coreApiUrl}/sessions → POST .../messages (SSE)\nworkspace: ${savedConfig.workingDir}\nmodel: ${savedConfig.model}\ncontext: ${savedConfig.contextFiles.join(', ') || '(none)'}`

  const terminalColor = (line: TerminalLine) => {
    if (line.type !== 'stderr') return 'text.primary'
    return line.source === 'vision' ? 'warning.main' : 'error.main'
  }

  const sessionFiles = sessionInfo?.files_in_chat

  const headerExtra = (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ maxWidth: 280 }}
        noWrap
        data-testid="session-status"
      >
        {statusMessage ||
          (isStarting ? 'Starting…' : isRunning ? 'Session live' : 'Stopped')}
      </Typography>
      {isRunning && sessionInfo && (
        <Chip
          label={`${sessionInfo.files_in_chat?.length ?? 0} files`}
          size="small"
          variant="outlined"
          title={sessionInfo.files_in_chat?.join('\n')}
        />
      )}
      {remainingAutoApproves > 0 && (
        <Chip
          label={`Auto: ${remainingAutoApproves}`}
          size="small"
          color="primary"
          variant="outlined"
        />
      )}
      {queuedCount > 0 && (
        <Chip label={`${queuedCount} queued`} size="small" color="info" variant="outlined" />
      )}
      {activeTodo && (
        <Chip
          label={`Task: ${activeTodo.title}`}
          size="small"
          color="secondary"
          variant="outlined"
          onClick={() => setActiveTab('tasks')}
          sx={{ cursor: 'pointer', maxWidth: 200 }}
        />
      )}
    </Stack>
  )

  return (
    <>
      <AppChrome
        nav={NAV}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabId)}
        process={process.snapshot}
        isRunning={isRunning}
        headerExtra={headerExtra}
      >
          {activeTab === 'chat' && (
            <>
            {!isRunning && showWelcome && (
              <WelcomePanel
                projectPath={savedConfig.workingDir}
                enginePath={engineInstallPath}
                onChooseProject={handleChooseProject}
                onOpenSettings={() => setActiveTab('settings')}
                onStart={() => {
                  setActiveTab('terminal')
                  void handleStart()
                }}
                onDismiss={dismissWelcome}
              />
            )}
            <ChatPanel
              messages={chatMessages}
              toolEvents={toolEvents}
              inputValue={inputValue}
              isRunning={isRunning}
              isBusy={isBusy}
              queuedCount={queuedCount}
              pendingConfirm={pendingConfirm}
              pathSuggestions={pathSuggestions}
              pathAssistActive={pathAssistActive}
              tokenStats={tokenStats}
              chatEndRef={chatEndRef}
              onInputChange={setInputValue}
              onSend={handleSend}
              onCancelSend={cancelSend}
              onConfirmAnswer={handleConfirmAnswer}
              onDismissMessage={handleDismissMessage}
              commands={commands}
              onPickCommand={(cmd) => setInputValue(cmd)}
              useNativeImagePicker={isTauriRuntime()}
              onNativeAttachImages={() => void handleNativeAttachImages()}
              onAttachFiles={(files) => void handleAttachFiles(files)}
              onAttachTerminalTail={handleAttachTerminalTail}
              terminalTailAvailable={terminalLines.some((l) => l.text.trim().length > 0)}
              onAttachContextDirectory={
                isTauriRuntime() ? () => void handleAttachContextDirectory() : undefined
              }
              onAttachFolderPath={
                !isTauriRuntime() ? (path) => void handleAttachFolderPath(path) : undefined
              }
            />
            </>
          )}

          {activeTab === 'tasks' && (
            <TodoPanel
              loading={todosLoading}
              todos={todoStore?.todos ?? []}
              activeId={todoStore?.activeId ?? null}
              templates={todoStore?.templates}
              onCreate={(title, spec, template) => void createTodo(title, spec, template)}
              onUpdate={(id, patch) => void updateTodo(id, patch)}
              onDelete={(id) => void deleteTodo(id)}
              onMoveTodo={(id, dir) => void moveTodo(id, dir)}
              onSyncSpecFromDisk={async (id) => {
                try {
                  await syncSpecFromDisk(id)
                  setSnackbar({ message: 'Spec layers loaded from disk', severity: 'info' })
                } catch (err) {
                  setSnackbar({
                    message: err instanceof Error ? err.message : String(err),
                    severity: 'error',
                  })
                }
              }}
              onCancelSpecGenerate={() => specGenerateAbortRef.current?.abort()}
              onSetActive={(id) => void setActiveTodo(id)}
              onMarkDone={(id) => void markDone(id)}
              onStartWork={(todo) => void handleStartWork(todo)}
              onImplementStep={(todo, step) => void handleImplementStep(todo, step)}
              httpReady={todosHttpReady}
              tauriLocal={todosTauriLocal}
              currentBranch={gitStatus?.branch ?? null}
              sessionReady={isRunning && Boolean(sessionInfo?.session_id) && todosHttpReady}
              sessionBusy={isBusy}
              specGenerating={specGenerating}
              onGenerateSpec={(id, prompt, mode) => handleGenerateSpec(id, prompt, mode)}
              onExportMarkdown={async () => {
                try {
                  const md = await exportMarkdown()
                  await navigator.clipboard.writeText(md)
                  setSnackbar({ message: 'Tasks copied to clipboard (markdown)', severity: 'info' })
                } catch (err) {
                  setSnackbar({
                    message: err instanceof Error ? err.message : String(err),
                    severity: 'error',
                  })
                }
              }}
              onImportMarkdown={async (markdown, merge) => {
                try {
                  await importMarkdown(markdown, merge)
                  setSnackbar({
                    message: merge ? 'Tasks merged from markdown' : 'Tasks imported from markdown',
                    severity: 'info',
                  })
                } catch (err) {
                  setSnackbar({
                    message: err instanceof Error ? err.message : String(err),
                    severity: 'error',
                  })
                }
              }}
            />
          )}

          {activeTab === 'terminal' && (
            <Paper variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}
              >
                Technical log — includes {DISPLAY_CORE} details for debugging
              </Typography>
              <Box className="vision-terminal" sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                {terminalLines
                  .filter((line) => line.channel !== 'user')
                  .map((line) => (
                    <Typography
                      key={line.id}
                      component="div"
                      sx={{ color: terminalColor(line), mb: 0.5 }}
                    >
                      {line.text}
                    </Typography>
                  ))}
                <div ref={terminalEndRef} />
              </Box>
              <Stack direction="row" spacing={1} sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<PlayArrowIcon />}
                  data-testid="terminal-start"
                  onClick={() => void handleStart()}
                  disabled={lifecycleActive}
                >
                  {lifecycleActive && !isRunning ? 'Starting…' : 'Start'}
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<StopIcon />}
                  data-testid="terminal-stop"
                  onClick={() => void handleStop()}
                  disabled={!lifecycleActive}
                >
                  Stop
                </Button>
              </Stack>
            </Paper>
          )}

          {activeTab === 'git' && (
            <Box sx={{ height: '100%', overflow: 'auto', py: 1 }}>
              <GitPanel
                workingDir={savedConfig.workingDir}
                lastGit={lastGit}
                gitStatus={gitStatus}
                gitLoading={gitLoading}
                onRefreshGit={refreshGit}
                onUndo={handleUndo}
                isRunning={isRunning}
                refreshToken={gitRefreshKey}
              />
            </Box>
          )}

          {activeTab === 'settings' && (
            <Container maxWidth="sm" disableGutters>
              <SettingsPanel
                config={config}
                appearance={appearance}
                apiPreview={apiPreview}
                sessionFiles={sessionFiles}
                onChange={setConfig}
                onAppearanceChange={setAppearance}
                onSave={handleSave}
                onReset={handleReset}
              />
            </Container>
          )}
      </AppChrome>

      <Snackbar
        open={snackbar !== null}
        autoHideDuration={6000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snackbar ? (
          <Alert severity={snackbar.severity} onClose={() => setSnackbar(null)} variant="filled">
            {snackbar.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  )
}

export default function App() {
  const [appearance, setAppearance] = useState<AppearanceConfig>(() => loadAppearance())
  const fonts = useMemo(() => resolveAppearanceFonts(appearance), [appearance])
  const theme = useMemo(() => createVisionTheme(fonts.ui), [fonts.ui])

  useEffect(() => {
    applyAppearanceCssVars(appearance)
  }, [appearance])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ProcessProvider>
        <AppShell appearance={appearance} setAppearance={setAppearance} />
      </ProcessProvider>
    </ThemeProvider>
  )
}
