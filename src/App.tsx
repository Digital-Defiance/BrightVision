import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  lazy,
  Suspense,
  type ReactNode,
} from 'react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import ChatIcon from '@mui/icons-material/Chat'
import ChecklistRtlIcon from '@mui/icons-material/ChecklistRtl'
import GitHubIcon from '@mui/icons-material/GitHub'
import SettingsIcon from '@mui/icons-material/Settings'
import TerminalIcon from '@mui/icons-material/Terminal'
import CodeIcon from '@mui/icons-material/Code'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import { Alert, Box, Button, Chip, Container, Paper, Snackbar, Stack, Typography } from '@mui/material'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { DISPLAY_CORE, ErrorSource, prefixForTechnicalLog, prefixForUserFacing } from './brand'
import { AppChrome } from './components/layout/AppChrome'
import { ResourceOverlay } from './components/layout/ResourceOverlay'
import { DEFAULT_CONFIG, defaultCoreApiUrl, type VisionConfig } from './ipc/config'
import {
  applyLocalLlmToConfig,
  isOllamaVisionModel,
  resolveLocalLlmForConfig,
  type LocalLlmRuntimeStatus,
  type LocalLlmSnapshot,
} from './ipc/localLlm'
import { LocalLlmPanel } from './components/local-llm/LocalLlmPanel'
import { type CoreConfirmEvent, type CoreEventBase } from './ipc/events'
import { SseIdleTimeoutError } from './ipc/sseIdle'
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
import { useVisionSession } from './hooks/useVisionSession'
import { useTurnResourcePeak } from './hooks/useTurnResourcePeak'
import { usePathCompletion } from './hooks/usePathCompletion'
import { filesToUploadParts } from './utils/imageUpload'
import { buildImplementStepMessage, buildStartWorkMessage } from './todos/formatContext'
import type { ImplementationStep } from './todos/tasksMd'
import type { TodoItem } from './todos/types'
import { useCommandCatalog } from './hooks/useCommandCatalog'
import { parseVisionClientCommand } from './ipc/visionClientCommands'
import { fetchOllamaModelsSnapshot } from './utils/ollamaModelRows'
import type { VisionClientCommandId } from './ipc/visionClientCommands'
import type { OllamaModelsSnapshot } from './ipc/localLlm'
import { useGitStatus } from './hooks/useGitStatus'
import { autoStageEditedFiles } from './ipc/gitStatus'
import { useSessionActivity } from './hooks/useSessionActivity'
import {
  extractSuggestedFilePaths,
  filterPathsNotInChat,
  isAwaitingFilesCta,
  mergeSuggestedPaths,
  pathsNotInChat,
} from './utils/suggestedFiles'
import {
  loadSuggestedFilesPrefs,
  PROCEED_AFTER_FILES_MESSAGE,
  saveSuggestedFilesPrefs,
  type SuggestedFilesPrefs,
} from './theme/suggestedFilesPrefs'
import { SessionContextChip } from './components/session/SessionContextChip'
import {
  buildEmptyLlmRetryMessage,
  isEmptyLlmWarning,
  rewriteEmptyLlmWarningIfNeeded,
} from './utils/emptyLlmResponse'
import {
  formatFilesNotAddedSnackbar,
  rewriteAddFileToolMessage,
} from './utils/addFileMessages'
import { appendTimingStatsCsvRow } from './ipc/timingStatsCsv'
import { ChatPanel, type ChatMessage, type ToolEvent } from './components/chat/ChatPanel'
import { TodoPanel } from './components/todos/TodoPanel'
import { GitPanel } from './components/GitPanel'
import { useWorkspaceTodos } from './hooks/useWorkspaceTodos'
import { WelcomePanel } from './components/onboarding/WelcomePanel'
import { SettingsPanel } from './components/settings/SettingsPanel'

const EditorPanel = lazy(() =>
  import('./components/editor/EditorPanel').then((m) => ({ default: m.EditorPanel }))
)
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
import {
  DEFAULT_THINKING_TIMING_PREFS,
  loadThinkingTimingPrefs,
  saveThinkingTimingPrefs,
  type ThinkingTimingPrefs,
} from './theme/thinkingTimingPrefs'
import {
  DEFAULT_RESOURCE_OVERLAY_PREFS,
  loadResourceOverlayPrefs,
  saveResourceOverlayPrefs,
  type ResourceOverlayPrefs,
} from './theme/resourceOverlayPrefs'
import { useAppVersions } from './hooks/useAppVersions'
import { StderrBatcher } from './utils/stderrBatch'
import { useThinkingTiming } from './hooks/useThinkingTiming'
import { useSessionStallWatch } from './hooks/useSessionStallWatch'
import { useResourceOverlay } from './hooks/useResourceOverlay'
import {
  clearAllThinkingStats,
  clearModelThinkingStats,
  loadThinkingStats,
  saveThinkingStats,
} from './utils/thinkingStats'
import {
  resolveMessageTurnTiming,
  shouldRecordTurnInHistory,
  type TurnThinkingTiming,
} from './utils/thinkingTiming'
import { estimatePathsContextChars } from './ipc/contextEstimate'
import {
  charsToEstimatedTokens,
  EMPTY_CONTEXT_USAGE,
  formatTokenCount,
  parseTokenUsageReport,
  type SessionContextUsage,
} from './utils/contextUsage'
import { buildGitStatusByPath } from './utils/editorGitStatus'
import {
  DEFAULT_MODEL_ROUTER_PREFS,
  formatModelRouteEvent,
  loadModelRouterPrefs,
  modelRouterApiPayload,
  saveModelRouterPrefs,
  type ModelRouterPrefs,
} from './theme/modelRouterPrefs'
import type { ModelRouterApiConfig, SendMessageOptions } from './ipc/httpClient'
import {
  ensureRoutedOllamaModel,
  prepareModelRouterHopper,
  type ModelRouteSnapshot,
} from './ipc/modelRouterLlm'
import { shouldOfferRouterEscalate } from './utils/modelRouterEscalate'
import type { RouterEscalateOffer } from './components/chat/ModelRouterBar'
import {
  DEFAULT_EDITOR_LANGUAGE_PREFS,
  loadEditorLanguagePrefs,
  saveEditorLanguagePrefs,
  type EditorLanguagePrefs,
} from './theme/editorLanguagePrefs'
import { createVisionTheme } from './theme'
import {
  APPEARANCE_STORAGE_KEY,
  CONFIG_STORAGE_KEY,
  RESOURCE_OVERLAY_STORAGE_KEY,
  THINKING_TIMING_STORAGE_KEY,
  EDITOR_LANGUAGE_PREFS_STORAGE_KEY,
  MODEL_ROUTER_PREFS_STORAGE_KEY,
  migrateLegacyStorageKeys,
  readStorageItem,
  removeStorageKeys,
} from './storageKeys'

const WELCOME_DISMISSED_KEY = 'vision-welcome-dismissed'

type TabId = 'chat' | 'terminal' | 'git' | 'editor' | 'settings' | 'tasks'

function migrateConfig(raw: Partial<VisionConfig> & Record<string, unknown>): VisionConfig {
  const merged: VisionConfig = { ...DEFAULT_CONFIG, ...raw }
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
  if (typeof merged.ollamaApiBase !== 'string') {
    merged.ollamaApiBase = ''
  }
  if (typeof merged.localLlmRoot !== 'string') {
    merged.localLlmRoot = ''
  }
  if (typeof merged.manageLocalLlm !== 'boolean') {
    merged.manageLocalLlm = true
  }
  if (merged.coreEnginePath === 'aider-vision-core') {
    merged.coreEnginePath = 'bright-vision-core'
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
  { id: 'editor', label: 'Editor', icon: <CodeIcon /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
]

function AppShell({
  appearance,
  setAppearance,
  thinkingTimingPrefs,
  setThinkingTimingPrefs,
  suggestedFilesPrefs,
  setSuggestedFilesPrefs,
  resourceOverlayPrefs,
  setResourceOverlayPrefs,
  editorLanguagePrefs,
  setEditorLanguagePrefs,
  modelRouterPrefs,
  setModelRouterPrefs,
}: {
  appearance: AppearanceConfig
  setAppearance: React.Dispatch<React.SetStateAction<AppearanceConfig>>
  thinkingTimingPrefs: ThinkingTimingPrefs
  setThinkingTimingPrefs: React.Dispatch<React.SetStateAction<ThinkingTimingPrefs>>
  suggestedFilesPrefs: SuggestedFilesPrefs
  setSuggestedFilesPrefs: React.Dispatch<React.SetStateAction<SuggestedFilesPrefs>>
  resourceOverlayPrefs: ResourceOverlayPrefs
  setResourceOverlayPrefs: React.Dispatch<React.SetStateAction<ResourceOverlayPrefs>>
  editorLanguagePrefs: EditorLanguagePrefs
  setEditorLanguagePrefs: React.Dispatch<React.SetStateAction<EditorLanguagePrefs>>
  modelRouterPrefs: ModelRouterPrefs
  setModelRouterPrefs: React.Dispatch<React.SetStateAction<ModelRouterPrefs>>
}) {
  const [activeTab, setActiveTab] = useState<TabId>('chat')
  const [editorPendingPath, setEditorPendingPath] = useState<string | null>(null)
  const [config, setConfig] = useState<VisionConfig>(DEFAULT_CONFIG)
  const [savedConfig, setSavedConfig] = useState<VisionConfig>(DEFAULT_CONFIG)
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
  const [snackbar, setSnackbar] = useState<{
    message: string
    severity: 'error' | 'info' | 'warning'
  } | null>(
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
  const chatMessagesRef = useRef(chatMessages)
  chatMessagesRef.current = chatMessages
  const ingestSuggestionsRef = useRef<(content: string) => void>(() => {})
  const suggestedFilesPrefsRef = useRef(suggestedFilesPrefs)
  suggestedFilesPrefsRef.current = suggestedFilesPrefs
  const lastAssistantStreamRef = useRef('')
  const lastUserPromptCharsRef = useRef(0)
  const turnTimingActiveRef = useRef(false)
  /** Send wall-clock; survives tracker reset until `done` finalizes the turn. */
  const turnWallStartMsRef = useRef<number | null>(null)
  /** Wall-clock + prompt size for messages queued while a turn is in flight. */
  const pendingTurnTimingQueueRef = useRef<{ promptChars: number; turnStartMs: number }[]>([])
  const queuedCountRef = useRef(0)
  /** Assistant bubble for the in-flight turn (avoids attributing timing to an older message). */
  const turnAssistantMessageIdRef = useRef<number | null>(null)
  /** True once this turn streams at least one assistant token (vs. empty queued follow-up). */
  const turnHadAssistantOutputRef = useRef(false)
  const turnTokenUsageRef = useRef<{ tokensSent: number; tokensReceived: number } | null>(null)
  const refreshSessionInfoRef = useRef<() => Promise<import('./ipc/httpClient').CoreSessionInfo | null>>(
    async () => null
  )
  const syncSessionFilesRef = useRef<(files: string[]) => void>(() => {})

  const thinkingTimingRef = useRef<{
    beginTurn: (n: number, turnStartMs?: number) => void
    syncContent: (content: string) => void
    finalizeTurn: (
      content: string,
      opts?: { wallStartMs?: number; promptChars?: number }
    ) => TurnThinkingTiming | null
    reset: () => void
    recordCompletedTurn: (
      t: TurnThinkingTiming,
      resources?: import('./ipc/resourceSnapshot').TurnResourcePeak,
      tokens?: { tokensSent: number; tokensReceived: number }
    ) => import('./utils/thinkingStats').TurnTimingRecord | null
  }>({
    beginTurn: () => {},
    syncContent: () => {},
    finalizeTurn: () => null,
    reset: () => {},
    recordCompletedTurn: () => null,
  })
  const startTurnTimingRef = useRef((promptChars: number, turnStartMs: number) => {
    turnWallStartMsRef.current = turnStartMs
    turnAssistantMessageIdRef.current = null
    turnHadAssistantOutputRef.current = false
    turnTokenUsageRef.current = null
    thinkingTimingRef.current.beginTurn(promptChars, turnStartMs)
    turnTimingActiveRef.current = true
  })
  const armNextQueuedTurnTimingRef = useRef(() => {
    const pending = pendingTurnTimingQueueRef.current.shift()
    if (pending) {
      startTurnTimingRef.current(pending.promptChars, pending.turnStartMs)
      return true
    }
    if (queuedCountRef.current > 0) {
      startTurnTimingRef.current(lastUserPromptCharsRef.current, Date.now())
      return true
    }
    return false
  })
  const unlistenersRef = useRef<UnlistenFn[]>([])
  const [suggestedPaths, setSuggestedPaths] = useState<string[]>([])
  const [suggestedAwaitingProceed, setSuggestedAwaitingProceed] = useState(false)
  const [trackTurnResources, setTrackTurnResources] = useState(false)
  const [lastUserMessageForRetry, setLastUserMessageForRetry] = useState<string | null>(null)
  const lastUserMessageForRetryRef = useRef<string | null>(null)
  const [lastModelRoute, setLastModelRoute] = useState<ModelRouteSnapshot | null>(null)
  const lastModelRouteRef = useRef<ModelRouteSnapshot | null>(null)
  const [routerEscalateOffer, setRouterEscalateOffer] = useState<RouterEscalateOffer | null>(null)
  const turnHadToolErrorRef = useRef(false)
  const isLocalLlmModel = isOllamaVisionModel(savedConfig.model)
  const modelRouterActive = modelRouterPrefs.enabled && isLocalLlmModel
  const [contextUsage, setContextUsage] = useState<SessionContextUsage>(EMPTY_CONTEXT_USAGE)

  useEffect(() => {
    migrateLegacyStorageKeys()
    const stored = readStorageItem(CONFIG_STORAGE_KEY, 'aider-vision-config')
    let merged = DEFAULT_CONFIG
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<VisionConfig> & Record<string, unknown>
        merged = migrateConfig(parsed)
      } catch (e) {
        console.error('Failed to parse stored config', e)
      }
    }
    const apply = (cfg: VisionConfig) => {
      setConfig(cfg)
      setSavedConfig(cfg)
    }
    if (isTauriRuntime()) {
      Promise.all([
        invoke<string>('detect_workspace', { hint: merged.workingDir || null }),
        merged.pythonPath.trim()
          ? Promise.resolve(merged.pythonPath)
          : invoke<string>('default_python_path'),
        invoke<LocalLlmSnapshot>('read_local_llm_config', {
          localLlmRoot: merged.localLlmRoot.trim() || null,
        }),
      ])
        .then(([dir, pythonPath, localLlm]) => {
          let next = {
            ...merged,
            workingDir: dir,
            pythonPath: merged.pythonPath.trim() || pythonPath,
          }
          next = applyLocalLlmToConfig(next, localLlm, true)
          if (
            dir !== merged.workingDir ||
            next.pythonPath !== merged.pythonPath ||
            next.localLlmRoot !== merged.localLlmRoot ||
            next.ollamaApiBase !== merged.ollamaApiBase ||
            next.model !== merged.model
          ) {
            setSavedConfig(next)
            localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next))
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
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next))
      setSnackbar({ message: 'Project folder updated', severity: 'info' })
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      })
    }
  }, [config])

  const stderrBatcherRef = useRef<StderrBatcher | null>(null)
  const flushStderrRef = useRef<(payload: string) => void>(() => {})

  const flushStderrToUi = useCallback((payload: string) => {
    const trimmed = payload.trim()
    if (!trimmed) return
    const id = Date.now()
    setTerminalLines((prev) =>
      capList(
        [
          ...prev,
          {
            id,
            text: `${prefixForUserFacing('core')} ${trimmed}`,
            type: 'stderr' as const,
            source: 'core' as const,
            channel: 'user' as const,
          },
          {
            id: id + 1,
            text: `${prefixForTechnicalLog()} ${trimmed}`,
            type: 'stderr' as const,
            source: 'core' as const,
            channel: 'technical' as const,
          },
        ],
        MAX_TERMINAL_LINES
      )
    )
    setChatMessages((chatPrev) =>
      capList(
        [
          ...chatPrev,
          {
            id,
            role: 'system' as const,
            content: `${prefixForUserFacing('core')} ${trimmed}`,
          },
        ],
        MAX_CHAT_MESSAGES
      )
    )
  }, [])

  flushStderrRef.current = flushStderrToUi
  if (!stderrBatcherRef.current) {
    stderrBatcherRef.current = new StderrBatcher((text) => flushStderrRef.current(text))
  }

  const appendStderr = useCallback((payload: string) => {
    stderrBatcherRef.current?.push(payload)
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

  const appendOllamaStatusToChat = useCallback(
    (command: VisionClientCommandId, snapshot: OllamaModelsSnapshot, userLabel: string) => {
      const userId = nextChatMessageId()
      const assistantId = nextChatMessageId()
      setChatMessages((prev) =>
        capList(
          [
            ...prev,
            { id: userId, role: 'user' as const, content: userLabel },
            {
              id: assistantId,
              role: 'assistant' as const,
              content: '',
              ollamaStatus: { command, snapshot },
            },
          ],
          MAX_CHAT_MESSAGES
        )
      )
    },
    [nextChatMessageId]
  )

  const removeLastPendingUserMessage = useCallback(() => {
    const id = popPendingUserMessageId(pendingUserMessageIdsRef.current)
    setChatMessages((prev) => removeChatMessageById(prev, id))
  }, [])

  const stallWatchRef = useRef<(type: string, detail?: string) => void>(() => {})

  const handleCoreEvent = useCallback((ev: CoreEventBase) => {
    const progressDetail =
      ev.type === 'progress'
        ? String((ev as { message?: string }).message ?? (ev as { label?: string }).label ?? '')
        : undefined
    stallWatchRef.current(ev.type, progressDetail)
    process.ingestCoreEvent(ev)
    if (ev.type === 'done') bumpGitRefresh()
    const orderId = nextChatMessageId()

    switch (ev.type) {
      case 'user_message': {
        streamingAssistantId.current = null
        lastAssistantStreamRef.current = ''
        if (!turnTimingActiveRef.current) {
          const wall = turnWallStartMsRef.current ?? Date.now()
          if (turnWallStartMsRef.current == null) turnWallStartMsRef.current = wall
          const chars = lastUserPromptCharsRef.current || String(ev.text ?? '').length
          startTurnTimingRef.current(chars, wall)
        }
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
        lastAssistantStreamRef.current = appendStreamingToken(
          lastAssistantStreamRef.current,
          chunk
        )
        let sid = streamingAssistantId.current
        if (sid === null) {
          sid = orderId
          streamingAssistantId.current = sid
          turnAssistantMessageIdRef.current = sid
          turnHadAssistantOutputRef.current = true
          setChatMessages((prev) => {
            const next = capList(
              [...prev, { id: sid!, role: 'assistant' as const, content: chunk }],
              MAX_CHAT_MESSAGES
            )
            thinkingTimingRef.current.syncContent(chunk)
            return next
          })
        } else {
          const captureSid = sid
          turnHadAssistantOutputRef.current = true
          setChatMessages((prev) => {
            const next = capList(
              prev.map((m) => {
                if (m.id !== captureSid) return m
                const content = appendStreamingToken(m.content, chunk)
                thinkingTimingRef.current.syncContent(content)
                return { ...m, content }
              }),
              MAX_CHAT_MESSAGES
            )
            return next
          })
        }
        break
      }
      case 'progress':
        break
      case 'model_route': {
        const snapshot: ModelRouteSnapshot = {
          tier: (ev.tier === 'heavy' ? 'heavy' : 'fast') as 'fast' | 'heavy',
          model: String(ev.model ?? ''),
          estimated_tokens: ev.estimated_tokens as number | undefined,
          reasons: ev.reasons as string[] | undefined,
          escalated: Boolean(ev.escalated),
        }
        lastModelRouteRef.current = snapshot
        setLastModelRoute(snapshot)
        const routeText = formatModelRouteEvent(snapshot)
        setChatMessages((prev) =>
          capList(
            [
              ...prev,
              {
                id: orderId,
                role: 'system' as const,
                content: `Model router: ${routeText}`,
              },
            ],
            MAX_CHAT_MESSAGES
          )
        )
        if (modelRouterPrefs.enabled) {
          void ensureRoutedOllamaModel(savedConfigRef.current, modelRouterPrefs, snapshot).then(
            (result) => {
              if (!result) return
              setTerminalLines((prev) => [
                ...prev,
                ...result.logs.map((text, i) => ({
                  id: Date.now() + i,
                  text: `[router] ${text}`,
                  type: 'stdout' as const,
                  source: 'vision' as const,
                })),
              ])
              const enriched: ModelRouteSnapshot = {
                ...snapshot,
                load_ms: result.load_ms,
                swapped: result.swapped,
              }
              lastModelRouteRef.current = enriched
              setLastModelRoute(enriched)
            }
          )
        }
        break
      }
      case 'tool_output': {
        const text = String(ev.text ?? '')
        const usage = parseTokenUsage(text)
        if (usage) {
          setTokenStats(usage)
          const report = parseTokenUsageReport(text)
          if (report) {
            setContextUsage((prev) => ({ ...prev, lastReport: report }))
            if (turnTimingActiveRef.current) {
              turnTokenUsageRef.current = {
                tokensSent: report.tokensSent,
                tokensReceived: report.tokensReceived,
              }
            }
          }
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
        const raw = String(ev.text ?? '')
        if (!raw.trim()) break
        turnHadToolErrorRef.current = true
        const text = rewriteAddFileToolMessage(raw, savedConfig.workingDir)
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
        const raw = String(ev.text ?? '')
        if (!raw.trim()) break
        const emptyLlm = isEmptyLlmWarning(raw)
        const text = rewriteEmptyLlmWarningIfNeeded(raw, isLocalLlmModel)
        streamingAssistantId.current = null
        setToolEvents((prev) =>
          capList(
            [
              ...prev,
              {
                id: orderId,
                type: 'tool_warning' as const,
                name: 'warning',
                output: text,
                ...(emptyLlm ? { emptyLlm: true as const } : {}),
              },
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
        const wallStart = turnWallStartMsRef.current
        const turnAssistantId = turnAssistantMessageIdRef.current
        const hadAssistantOutput = turnHadAssistantOutputRef.current
        let turnTiming: TurnThinkingTiming | null = null
        if (wallStart != null) {
          const prev = chatMessagesRef.current
          const target =
            turnAssistantId != null
              ? prev.find((m) => m.id === turnAssistantId && m.role === 'assistant')
              : undefined
          const content = target?.content?.trim()
            ? target.content
            : lastAssistantStreamRef.current.trim()
          if (content || turnTimingActiveRef.current) {
            turnTiming = thinkingTimingRef.current.finalizeTurn(content, {
              wallStartMs: wallStart,
              promptChars: lastUserPromptCharsRef.current,
            })
            if (
              turnTiming &&
              shouldRecordTurnInHistory({
                timing: turnTiming,
                hadAssistantOutput,
                hadExplicitAssistantTarget: turnAssistantId != null,
              })
            ) {
              const recorded = thinkingTimingRef.current.recordCompletedTurn(
                turnTiming,
                takeTurnResourcePeakRef.current(),
                turnTokenUsageRef.current ?? undefined
              )
              turnTokenUsageRef.current = null
              if (
                recorded &&
                thinkingTimingPrefs.timingStatsAutoAppendCsv &&
                thinkingTimingPrefs.timingStatsCsvPath.trim()
              ) {
                void appendTimingStatsCsvRow(
                  savedConfig.workingDir,
                  thinkingTimingPrefs.timingStatsCsvPath,
                  recorded
                ).catch((err) => {
                    setSnackbar({
                      message: err instanceof Error ? err.message : String(err),
                      severity: 'warning',
                    })
                  })
              }
            }
          }
        }
        if (!turnTiming) takeTurnResourcePeakRef.current()
        turnAssistantMessageIdRef.current = null
        streamingAssistantId.current = null
        setStatusMessage('Ready')
        const moreQueued = queuedCountRef.current > 0
        if (moreQueued) {
          if (!armNextQueuedTurnTimingRef.current()) {
            turnWallStartMsRef.current = null
            turnTimingActiveRef.current = false
            setTrackTurnResources(false)
            thinkingTimingRef.current.reset()
          }
        } else {
          turnWallStartMsRef.current = null
          turnTimingActiveRef.current = false
          setTrackTurnResources(false)
          thinkingTimingRef.current.reset()
          pendingTurnTimingQueueRef.current = []
        }
        setChatMessages((prev) => {
          const attachId =
            turnAssistantId ??
            (hadAssistantOutput
              ? (() => {
                  for (let i = prev.length - 1; i >= 0; i--) {
                    if (prev[i].role === 'assistant') return prev[i].id
                  }
                  return null
                })()
              : null)
          if (attachId === null || !turnTiming) return prev
          return capList(
            prev.map((m) => {
              if (m.id !== attachId) return m
              return {
                ...m,
                ...(applied.length > 0 ? { appliedFiles: applied } : {}),
                turnTiming: resolveMessageTurnTiming(m.turnTiming, turnTiming),
              }
            }),
            MAX_CHAT_MESSAGES
          )
        })
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
        if (
          shouldOfferRouterEscalate(lastModelRouteRef.current, {
            editedFiles: applied,
            userMessage: lastUserMessageForRetryRef.current,
            hadToolError: turnHadToolErrorRef.current,
            escalateOnFailureEnabled: modelRouterPrefs.escalateOnFailure,
          })
        ) {
          setRouterEscalateOffer({
            message: lastUserMessageForRetryRef.current ?? '',
          })
        } else {
          setRouterEscalateOffer(null)
        }
        turnHadToolErrorRef.current = false
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
        {
          const assistantText = lastAssistantStreamRef.current
          if (assistantText.trim()) {
            ingestSuggestionsRef.current(assistantText)
            const awaiting = isAwaitingFilesCta(assistantText)
            setSuggestedAwaitingProceed(awaiting)
            const prefs = suggestedFilesPrefsRef.current
            if (awaiting && prefs.autoAddSuggested) {
              const paths = filterPathsNotInChat(
                extractSuggestedFilePaths(assistantText),
                filesInChatRef.current
              )
              if (paths.length) {
                void runSuggestedAddAndProceedRef.current(paths, {
                  proceed: prefs.autoProceedAfterAdd,
                })
              }
            }
          } else {
            setSuggestedAwaitingProceed(false)
          }
          lastAssistantStreamRef.current = ''
        }
        void refreshSessionInfoRef.current().then((info) => {
          if (info?.files_in_chat) syncSessionFilesRef.current(info.files_in_chat)
        })
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
  }, [
    process,
    bumpGitRefresh,
    nextChatMessageId,
    isLocalLlmModel,
    savedConfig.workingDir,
    thinkingTimingPrefs.timingStatsAutoAppendCsv,
    thinkingTimingPrefs.timingStatsCsvPath,
  ])

  const { pendingConfirm, setPendingConfirm, dismissConfirm, lastGit, filesInChat, setFilesInChat, wrapHandler } =
    useSessionActivity()

  const filesInChatRef = useRef(filesInChat)
  filesInChatRef.current = filesInChat

  ingestSuggestionsRef.current = (content: string) => {
    setSuggestedPaths((prev) => mergeSuggestedPaths(prev, content, filesInChatRef.current))
  }

  useEffect(() => {
    setSuggestedPaths((prev) => filterPathsNotInChat(prev, filesInChat))
  }, [filesInChat])
  const {
    isRunning,
    isStarting,
    isBusy,
    queuedCount,
    clearQueue,
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
    refreshSessionInfo,
    patchSessionFiles,
  } = useVisionSession(wrapHandler(handleCoreEvent))

  queuedCountRef.current = queuedCount

  refreshSessionInfoRef.current = refreshSessionInfo

  const syncSessionFiles = useCallback(
    (files: string[]) => {
      setFilesInChat(files)
      patchSessionFiles(files)
    },
    [setFilesInChat, patchSessionFiles]
  )

  syncSessionFilesRef.current = syncSessionFiles

  useEffect(() => {
    const files = sessionInfo?.files_in_chat
    if (!isRunning || !files) return
    syncSessionFiles(files)
  }, [sessionInfo?.files_in_chat, isRunning, syncSessionFiles])

  const recordAddedContextEstimate = useCallback(async (paths: string[]) => {
    if (!paths.length) return
    const chars = await estimatePathsContextChars(savedConfig.workingDir, paths)
    const est = charsToEstimatedTokens(chars)
    if (est <= 0) return
    setContextUsage((prev) => ({
      ...prev,
      estimatedFromAdds: prev.estimatedFromAdds + est,
    }))
    return est
  }, [savedConfig.workingDir])

  const applyFilesAdded = useCallback(
    async (paths: string[], info: { files_in_chat: string[] }, label?: string) => {
      syncSessionFiles(info.files_in_chat)
      const missing = pathsNotInChat(paths, info.files_in_chat)
      const est = await recordAddedContextEstimate(paths)
      const parts: string[] = []
      if (label) parts.push(label)
      if (est && est > 0) parts.push(`+~${formatTokenCount(est)} context`)
      if (parts.length) {
        setSnackbar({ message: parts.join(' · '), severity: 'info' })
      }
      if (missing.length) {
        setSnackbar({
          message: formatFilesNotAddedSnackbar(missing, savedConfig.workingDir),
          severity: 'warning',
        })
      }
    },
    [syncSessionFiles, recordAddedContextEstimate, savedConfig.workingDir]
  )

  const stallWatch = useSessionStallWatch(isBusy, queuedCount)
  const resourceOverlay = useResourceOverlay(resourceOverlayPrefs)
  const { resetPeak: resetTurnResourcePeak, takePeak: takeTurnResourcePeak } =
    useTurnResourcePeak(isRunning && trackTurnResources, resourceOverlayPrefs.pollIntervalSec)
  const takeTurnResourcePeakRef = useRef(takeTurnResourcePeak)
  takeTurnResourcePeakRef.current = takeTurnResourcePeak
  stallWatchRef.current = stallWatch.touchEvent

  const thinkingTiming = useThinkingTiming(savedConfig.model, thinkingTimingPrefs)
  thinkingTimingRef.current = {
    beginTurn: thinkingTiming.beginTurn,
    syncContent: thinkingTiming.syncContent,
    finalizeTurn: thinkingTiming.finalizeTurn,
    reset: thinkingTiming.reset,
    recordCompletedTurn: thinkingTiming.recordCompletedTurn,
  }
  startTurnTimingRef.current = (promptChars: number, turnStartMs: number) => {
    turnWallStartMsRef.current = turnStartMs
    turnAssistantMessageIdRef.current = null
    resetTurnResourcePeak()
    setTrackTurnResources(true)
    thinkingTiming.beginTurn(promptChars, turnStartMs)
    turnTimingActiveRef.current = true
  }

  const handleCancelSend = useCallback(() => {
    cancelSend()
    // Keep turnWallStartMsRef until `done` so wall-clock response time stays correct.
    thinkingTiming.reset()
    turnTimingActiveRef.current = false
    setTrackTurnResources(false)
    pendingTurnTimingQueueRef.current = []
  }, [thinkingTiming, cancelSend])

  const lifecycleActive = isSessionLifecycleActive(
    process.snapshot,
    isRunning,
    isStarting
  )

  const todoApiClient = useMemo(
    () => new CoreHttpClient(savedConfig.coreApiUrl, savedConfig.coreApiToken || undefined),
    [savedConfig.coreApiUrl, savedConfig.coreApiToken]
  )

  const appVersions = useAppVersions(httpClient ?? todoApiClient, {
    enginePaths: {
      coreEnginePath: savedConfig.coreEnginePath,
      pythonPath: savedConfig.pythonPath,
    },
    refreshDeps: [isRunning, httpClient, activeTab === 'settings'],
  })

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
  } = useGitStatus(
    savedConfig.workingDir,
    gitRefreshKey,
    isRunning,
    activeTab === 'git',
    activeTab === 'editor'
  )

  const editorGitStatusByPath = useMemo(
    () => buildGitStatusByPath(gitStatus?.files ?? []),
    [gitStatus?.files]
  )

  const handleOpenInEditor = useCallback((path: string) => {
    const normalized = path.replace(/\\/g, '/').trim()
    if (!normalized) return
    setEditorPendingPath(normalized)
    setActiveTab('editor')
  }, [])

  useEffect(() => {
    if (!isTauriRuntime()) return
    const setup = async () => {
      unlistenersRef.current.push(
        await listen<string>('vision-error', (event) => appendStderr(event.payload))
      )
    }
    setup()
    return () => {
      stderrBatcherRef.current?.flushNow()
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
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config))
    saveAppearance(appearance)
    saveThinkingTimingPrefs(thinkingTimingPrefs)
    saveResourceOverlayPrefs(resourceOverlayPrefs)
    saveEditorLanguagePrefs(editorLanguagePrefs)
    saveModelRouterPrefs(modelRouterPrefs)
    setSnackbar({ message: 'Settings saved', severity: 'info' })
  }

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG)
    setSavedConfig(DEFAULT_CONFIG)
    removeStorageKeys([
      CONFIG_STORAGE_KEY,
      APPEARANCE_STORAGE_KEY,
      THINKING_TIMING_STORAGE_KEY,
      RESOURCE_OVERLAY_STORAGE_KEY,
      EDITOR_LANGUAGE_PREFS_STORAGE_KEY,
      MODEL_ROUTER_PREFS_STORAGE_KEY,
    ])
    setAppearance({ ...DEFAULT_APPEARANCE })
    applyAppearanceCssVars(DEFAULT_APPEARANCE)
    setThinkingTimingPrefs({ ...DEFAULT_THINKING_TIMING_PREFS })
    setResourceOverlayPrefs({ ...DEFAULT_RESOURCE_OVERLAY_PREFS })
    setEditorLanguagePrefs({ ...DEFAULT_EDITOR_LANGUAGE_PREFS })
    setModelRouterPrefs({ ...DEFAULT_MODEL_ROUTER_PREFS })
  }

  const handleClearThinkingStatsForModel = useCallback(() => {
    const next = clearModelThinkingStats(loadThinkingStats(), savedConfig.model)
    saveThinkingStats(next)
    thinkingTiming.refreshStats()
    setSnackbar({ message: 'Timing history cleared for current model', severity: 'info' })
  }, [savedConfig.model, thinkingTiming])

  const handleClearAllThinkingStats = useCallback(() => {
    saveThinkingStats(clearAllThinkingStats())
    thinkingTiming.refreshStats()
    setSnackbar({ message: 'All timing history cleared', severity: 'info' })
  }, [thinkingTiming])

  const appendTerminalLog = useCallback((lines: string[]) => {
    if (!lines.length) return
    setTerminalLines((prev) => [
      ...prev,
      ...lines.map((text, i) => ({
        id: Date.now() + i,
        text,
        type: 'stdout' as const,
        source: 'vision' as const,
      })),
    ])
  }, [])

  const ensureLocalLlm = async (): Promise<void> => {
    if (!isTauriRuntime() || !savedConfig.manageLocalLlm || !isOllamaVisionModel(savedConfig.model)) {
      return
    }
    const { ollamaHost, modelTag } = resolveLocalLlmForConfig(savedConfig)
    if (!modelTag) return
    process.apply({ phase: 'booting_api', label: 'Starting Local LLM', progress: 0.1 })
    try {
      const s = await invoke<LocalLlmRuntimeStatus>('local_llm_start_plain', {
        ollamaHost,
        modelTag,
      })
      appendTerminalLog(s.logs.map((l) => `[local-llm] ${l}`))
      if (modelRouterPrefs.enabled) {
        const hopperLogs = await prepareModelRouterHopper(savedConfig, modelRouterPrefs)
        if (hopperLogs.length) {
          appendTerminalLog(hopperLogs.map((l) => `[router] ${l}`))
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendTerminalLog([`[local-llm] ${msg}`])
      throw new Error(`Local LLM: ${msg}`)
    }
  }

  const handleStart = async () => {
    if (lifecycleActive) {
      await stop()
      process.idle()
    }
    try {
      await ensureLocalLlm()
      const routerPayload = modelRouterApiPayload(modelRouterPrefs, savedConfig.model)
      const { info, workingDir } = await start(savedConfig, {
        modelRouter: routerPayload as ModelRouterApiConfig | undefined,
      })
      if (workingDir !== savedConfig.workingDir) {
        const next = { ...savedConfig, workingDir }
        setSavedConfig(next)
        setConfig(next)
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next))
      }
      syncSessionFiles(info.files_in_chat ?? [])
      setContextUsage(EMPTY_CONTEXT_USAGE)
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
      syncSessionFiles([])
      setContextUsage(EMPTY_CONTEXT_USAGE)
      setSuggestedPaths([])
      // Do not clear turnWallStartMsRef here — late `done` still finalizes full Send→done time.
      thinkingTiming.reset()
      turnTimingActiveRef.current = false
      setTrackTurnResources(false)
      pendingTurnTimingQueueRef.current = []
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
      await applyFilesAdded(
        paths,
        info,
        `Attached ${paths.length} file${paths.length === 1 ? '' : 's'} to the session`
      )
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      })
    }
  }, [isRunning, savedConfig.workingDir, addFiles, applyFilesAdded])

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
        const names = parts.map((p) => p.filename)
        await applyFilesAdded(
          names,
          info,
          `Attached ${parts.length} file${parts.length === 1 ? '' : 's'} to the session`
        )
      } catch (err) {
        setSnackbar({
          message: err instanceof Error ? err.message : String(err),
          severity: 'error',
        })
      }
    },
    [isRunning, uploadFiles, applyFilesAdded]
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
      await applyFilesAdded([picked], info, 'Folder added to session context')
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      })
    }
  }, [isRunning, savedConfig.workingDir, addFiles, applyFilesAdded])

  const handleAttachFolderPath = useCallback(
    async (relativePath: string) => {
      if (!isRunning) return
      const path = relativePath.trim().replace(/\\/g, '/').replace(/^\.\//, '')
      if (!path) return
      try {
        const info = await addFiles([path])
        await applyFilesAdded([path], info, `Added folder ${path} to session context`)
      } catch (err) {
        setSnackbar({
          message: err instanceof Error ? err.message : String(err),
          severity: 'error',
        })
      }
    },
    [isRunning, addFiles, applyFilesAdded]
  )

  const handleDismissSuggested = useCallback((path: string) => {
    setSuggestedPaths((prev) => prev.filter((p) => p !== path))
  }, [])

  const handleClearSuggested = useCallback(() => setSuggestedPaths([]), [])

  const handleAddSuggestedOne = useCallback(
    async (path: string) => {
      if (!isRunning) return
      try {
        const info = await addFiles([path])
        setSuggestedPaths((prev) => filterPathsNotInChat(prev, info.files_in_chat))
        await applyFilesAdded([path], info, `Added ${path} to session`)
      } catch (err) {
        setSnackbar({
          message: err instanceof Error ? err.message : String(err),
          severity: 'error',
        })
      }
    },
    [isRunning, addFiles, applyFilesAdded]
  )

  const handleAddAllSuggested = useCallback(async () => {
    if (!isRunning || suggestedPaths.length === 0) return
    const paths = [...suggestedPaths]
    try {
      const info = await addFiles(paths)
      setSuggestedPaths((prev) => filterPathsNotInChat(prev, info.files_in_chat))
      await applyFilesAdded(
        paths,
        info,
        `Added ${paths.length} file${paths.length === 1 ? '' : 's'} to session`
      )
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      })
    }
  }, [isRunning, suggestedPaths, addFiles, applyFilesAdded])

  const handleQueueSuggestedAdds = useCallback(async () => {
    if (!isRunning || suggestedPaths.length === 0) return
    const paths = [...suggestedPaths]
    try {
      const info = await addFiles(paths)
      setSuggestedPaths((prev) => filterPathsNotInChat(prev, info.files_in_chat))
      const label = isBusy
        ? `Added ${paths.length} file${paths.length === 1 ? '' : 's'} while the current turn finishes`
        : `Added ${paths.length} file${paths.length === 1 ? '' : 's'} to session`
      await applyFilesAdded(paths, info, label)
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      })
    }
  }, [isRunning, isBusy, suggestedPaths, addFiles, applyFilesAdded])

  const rememberUserMessageForRetry = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    lastUserMessageForRetryRef.current = trimmed
    setLastUserMessageForRetry(trimmed)
  }, [])

  const deliverUserMessage = useCallback(
    async (
      text: string,
      todoOptions?: { activeTodoId: string; injectTodoSpec: boolean },
      sendExtras?: SendMessageOptions
    ) => {
      lastUserPromptCharsRef.current = text.length
      lastAssistantStreamRef.current = ''
      setRouterEscalateOffer(null)
      stallWatch.touchEvent('user_send')
      appendUserMessageToChat(text, true)
      const turnStartMs = Date.now()
      if (isBusy) {
        pendingTurnTimingQueueRef.current.push({ promptChars: text.length, turnStartMs })
      } else {
        startTurnTimingRef.current(text.length, turnStartMs)
      }
      const result = await send(text, { ...todoOptions, ...sendExtras })
      return result
    },
    [isBusy, send, appendUserMessageToChat, stallWatch]
  )

  const handleEscalateRouter = useCallback(async () => {
    const text = routerEscalateOffer?.message?.trim() || lastUserMessageForRetryRef.current?.trim()
    if (!text || !isRunning) return
    setRouterEscalateOffer(null)
    const injectSpec = Boolean(activeTodo && todoInjectedIdRef.current !== activeTodo.id)
    const todoOptions = activeTodo
      ? { activeTodoId: activeTodo.id, injectTodoSpec: injectSpec }
      : undefined
    try {
      await deliverUserMessage(text, todoOptions, { escalateFromLast: true })
      setSnackbar({ message: 'Escalating to heavy model…', severity: 'info' })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setSnackbar({
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      })
    }
  }, [routerEscalateOffer, isRunning, activeTodo, deliverUserMessage])

  const handleForceRouterTier = useCallback(
    async (tier: 'fast' | 'heavy') => {
      const text = inputValue.trim() || lastUserMessageForRetryRef.current?.trim()
      if (!text || !isRunning) {
        setSnackbar({
          message: 'Enter a message or complete a turn before forcing a tier',
          severity: 'info',
        })
        return
      }
      if (inputValue.trim()) setInputValue('')
      const injectSpec = Boolean(activeTodo && todoInjectedIdRef.current !== activeTodo.id)
      const todoOptions = activeTodo
        ? { activeTodoId: activeTodo.id, injectTodoSpec: injectSpec }
        : undefined
      try {
        await deliverUserMessage(text, todoOptions, { forceTier: tier })
        setSnackbar({ message: `Forced ${tier} tier`, severity: 'info' })
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setSnackbar({
          message: err instanceof Error ? err.message : String(err),
          severity: 'error',
        })
      }
    },
    [inputValue, isRunning, activeTodo, deliverUserMessage]
  )

  const handleRetryEmptyLlm = useCallback(
    async (mode: 'exact' | 'nudge') => {
      if (!isRunning) return
      const original = lastUserMessageForRetryRef.current
      if (!original) {
        setSnackbar({ message: 'No previous message to retry', severity: 'info' })
        return
      }
      const text = buildEmptyLlmRetryMessage(original, mode)
      if (!text) return
      const injectSpec = Boolean(activeTodo && todoInjectedIdRef.current !== activeTodo.id)
      const todoOptions = activeTodo
        ? { activeTodoId: activeTodo.id, injectTodoSpec: injectSpec }
        : undefined
      try {
        const result = await deliverUserMessage(text, todoOptions)
        if (injectSpec && activeTodo) todoInjectedIdRef.current = activeTodo.id
        if (result.queued) {
          setSnackbar({
            message: 'Retry queued — will send when the current turn finishes',
            severity: 'info',
          })
        } else {
          setSnackbar({
            message: mode === 'exact' ? 'Retrying last message…' : 'Retrying with hint…',
            severity: 'info',
          })
        }
      } catch (err) {
        turnWallStartMsRef.current = null
        turnAssistantMessageIdRef.current = null
        turnHadAssistantOutputRef.current = false
        turnTimingActiveRef.current = false
        setTrackTurnResources(false)
        thinkingTimingRef.current.reset()
        if (err instanceof Error && err.name === 'AbortError') {
          setStatusMessage('Stopped')
          return
        }
        removeLastPendingUserMessage()
        setSnackbar({
          message: err instanceof Error ? err.message : String(err),
          severity: 'error',
        })
      }
    },
    [
      isRunning,
      activeTodo,
      deliverUserMessage,
      rememberUserMessageForRetry,
      removeLastPendingUserMessage,
    ]
  )

  const sendProceedMessage = useCallback(async () => {
    if (!isRunning) return
    const msg = PROCEED_AFTER_FILES_MESSAGE
    rememberUserMessageForRetry(msg)
    lastUserPromptCharsRef.current = msg.length
    lastAssistantStreamRef.current = ''
    stallWatch.touchEvent('user_send')
    appendUserMessageToChat(msg, true)
    const turnStartMs = Date.now()
    if (isBusy) {
      pendingTurnTimingQueueRef.current.push({ promptChars: msg.length, turnStartMs })
    } else {
      startTurnTimingRef.current(msg.length, turnStartMs)
    }
    try {
      const result = await send(msg)
      if (result.queued) {
        setSnackbar({
          message: 'Queued “proceed” — will send when the current turn finishes',
          severity: 'info',
        })
      }
    } catch (err) {
      turnWallStartMsRef.current = null
      turnAssistantMessageIdRef.current = null
      turnHadAssistantOutputRef.current = false
      turnTimingActiveRef.current = false
      thinkingTimingRef.current.reset()
      removeLastPendingUserMessage()
      setSnackbar({
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      })
    }
  }, [
    isRunning,
    isBusy,
    send,
    appendUserMessageToChat,
    removeLastPendingUserMessage,
    stallWatch,
  ])

  const runSuggestedAddAndProceed = useCallback(
    async (paths: string[], opts?: { proceed?: boolean }) => {
      if (!isRunning || paths.length === 0) return
      const shouldProceed = opts?.proceed ?? true
      try {
        const info = await addFiles(paths)
        setSuggestedPaths((prev) => filterPathsNotInChat(prev, info.files_in_chat))
        await applyFilesAdded(
          paths,
          info,
          `Added ${paths.length} file${paths.length === 1 ? '' : 's'} to session`
        )
        if (pathsNotInChat(paths, info.files_in_chat).length > 0) return
        if (shouldProceed) {
          await sendProceedMessage()
        }
      } catch (err) {
        setSnackbar({
          message: err instanceof Error ? err.message : String(err),
          severity: 'error',
        })
      }
    },
    [isRunning, addFiles, applyFilesAdded, sendProceedMessage]
  )

  const runSuggestedAddAndProceedRef = useRef(runSuggestedAddAndProceed)
  runSuggestedAddAndProceedRef.current = runSuggestedAddAndProceed

  const handleAddAllAndProceed = useCallback(async () => {
    if (!isRunning || suggestedPaths.length === 0) return
    await runSuggestedAddAndProceed([...suggestedPaths], { proceed: true })
  }, [isRunning, suggestedPaths, runSuggestedAddAndProceed])

  const handleSuggestedFilesPrefsChange = useCallback((prefs: SuggestedFilesPrefs) => {
    setSuggestedFilesPrefs(prefs)
    saveSuggestedFilesPrefs(prefs)
  }, [setSuggestedFilesPrefs])

  const handleEditorLanguagePrefsChange = useCallback((prefs: EditorLanguagePrefs) => {
    setEditorLanguagePrefs(prefs)
    saveEditorLanguagePrefs(prefs)
  }, [setEditorLanguagePrefs])

  const handleModelRouterPrefsChange = useCallback((prefs: ModelRouterPrefs) => {
    setModelRouterPrefs(prefs)
    saveModelRouterPrefs(prefs)
  }, [setModelRouterPrefs])

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
    const clientCmd = parseVisionClientCommand(text)
    if (clientCmd) {
      setInputValue('')
      try {
        const snapshot = await fetchOllamaModelsSnapshot(savedConfig)
        appendOllamaStatusToChat(clientCmd.id, snapshot, text)
      } catch (err) {
        setSnackbar({
          message: err instanceof Error ? err.message : String(err),
          severity: 'error',
        })
      }
      return
    }

    setInputValue('')
    rememberUserMessageForRetry(text)
    const injectSpec = Boolean(activeTodo && todoInjectedIdRef.current !== activeTodo.id)
    const todoOptions = activeTodo
      ? { activeTodoId: activeTodo.id, injectTodoSpec: injectSpec }
      : undefined
    try {
      const result = await deliverUserMessage(text, todoOptions)
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
      turnWallStartMsRef.current = null
      turnAssistantMessageIdRef.current = null
      turnHadAssistantOutputRef.current = false
      turnTimingActiveRef.current = false
      setTrackTurnResources(false)
      thinkingTimingRef.current.reset()
      if (err instanceof Error && err.name === 'AbortError') {
        setStatusMessage('Stopped')
        return
      }
      removeLastPendingUserMessage()
      setInputValue(text)
      setSnackbar({
        message:
          err instanceof SseIdleTimeoutError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err),
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

  const handleDismissToolEvent = (toolEventId: number) => {
    setToolEvents((prev) => prev.filter((t) => t.id !== toolEventId))
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

  const sessionFiles = filesInChat

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
        <SessionContextChip
          files={sessionFiles}
          usage={contextUsage}
          onOpenInEditor={isTauriRuntime() ? handleOpenInEditor : undefined}
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
        <>
          <Chip label={`${queuedCount} queued`} size="small" color="info" variant="outlined" />
          <Button
            size="small"
            variant="text"
            color="inherit"
            data-testid="clear-message-queue"
            onClick={() => {
              clearQueue()
              setSnackbar({
                message: 'Cleared queued messages — current turn still runs until Stop or done',
                severity: 'info',
              })
            }}
          >
            Clear queue
          </Button>
        </>
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
        liveTiming={thinkingTiming.live}
        headerExtra={headerExtra}
        railFooter={
          resourceOverlay.enabled ? (
            <ResourceOverlay
              snapshot={resourceOverlay.snapshot}
              prefs={resourceOverlayPrefs}
              ready={resourceOverlay.ready}
            />
          ) : undefined
        }
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
              onCancelSend={handleCancelSend}
              thinkingTimingPrefs={thinkingTimingPrefs}
              turnActivityHint={stallWatch.hint}
              turnStalled={stallWatch.stalled}
              onConfirmAnswer={handleConfirmAnswer}
              onDismissMessage={handleDismissMessage}
              onDismissToolEvent={handleDismissToolEvent}
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
              suggestedFilePaths={suggestedPaths}
              suggestedAwaitingProceed={suggestedAwaitingProceed}
              suggestedFilesPrefs={suggestedFilesPrefs}
              onSuggestedFilesPrefsChange={handleSuggestedFilesPrefsChange}
              onSuggestedAddOne={(path) => void handleAddSuggestedOne(path)}
              onSuggestedAddAll={() => void handleAddAllSuggested()}
              onSuggestedAddAllAndProceed={() => void handleAddAllAndProceed()}
              onSuggestedQueueAdds={() => void handleQueueSuggestedAdds()}
              onSuggestedDismiss={handleDismissSuggested}
              onSuggestedClearAll={handleClearSuggested}
              lastUserMessageForRetry={lastUserMessageForRetry}
              onRetryEmptyLlm={(mode) => void handleRetryEmptyLlm(mode)}
              onOpenInEditor={isTauriRuntime() ? handleOpenInEditor : undefined}
              modelRouterEnabled={modelRouterActive}
              lastModelRoute={lastModelRoute}
              routerEscalateOffer={routerEscalateOffer}
              onEscalateRouter={() => void handleEscalateRouter()}
              onForceRouterTier={(tier) => void handleForceRouterTier(tier)}
              onDismissRouterEscalate={() => setRouterEscalateOffer(null)}
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
              <Box sx={{ px: 2, pt: 2 }}>
                <LocalLlmPanel
                  config={config}
                  compact
                  onManageChange={(manageLocalLlm) => setConfig({ ...config, manageLocalLlm })}
                  onLogLines={appendTerminalLog}
                />
              </Box>
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

          {activeTab === 'editor' && (
            <Suspense
              fallback={
                <Typography sx={{ p: 2 }} color="text.secondary">
                  Loading editor…
                </Typography>
              }
            >
              <EditorPanel
                workingDir={savedConfig.workingDir}
                isRunning={isRunning}
                editorLanguagePrefs={editorLanguagePrefs}
                pendingOpenPath={editorPendingPath}
                onPendingOpenConsumed={() => setEditorPendingPath(null)}
                gitStatusByPath={editorGitStatusByPath}
                onAddToContext={(paths) => {
                  if (paths[0]) void handleAddSuggestedOne(paths[0])
                }}
                onNotify={(message, severity) => setSnackbar({ message, severity })}
              />
            </Suspense>
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
                thinkingTimingPrefs={thinkingTimingPrefs}
                onThinkingTimingPrefsChange={setThinkingTimingPrefs}
                thinkingStatsStore={thinkingTiming.statsStore}
                onClearThinkingStatsForModel={handleClearThinkingStatsForModel}
                onClearAllThinkingStats={handleClearAllThinkingStats}
                onTimingStatsMessage={(message, severity) =>
                  setSnackbar({ message, severity })
                }
                resourceOverlayPrefs={resourceOverlayPrefs}
                onResourceOverlayPrefsChange={setResourceOverlayPrefs}
                suggestedFilesPrefs={suggestedFilesPrefs}
                onSuggestedFilesPrefsChange={handleSuggestedFilesPrefsChange}
                editorLanguagePrefs={editorLanguagePrefs}
                onEditorLanguagePrefsChange={handleEditorLanguagePrefsChange}
                modelRouterPrefs={modelRouterPrefs}
                onModelRouterPrefsChange={handleModelRouterPrefsChange}
                sessionModel={config.model}
                onSave={handleSave}
                onReset={handleReset}
                appVersions={appVersions}
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
  const [thinkingTimingPrefs, setThinkingTimingPrefs] = useState<ThinkingTimingPrefs>(() =>
    loadThinkingTimingPrefs()
  )
  const [suggestedFilesPrefs, setSuggestedFilesPrefs] = useState<SuggestedFilesPrefs>(() =>
    loadSuggestedFilesPrefs()
  )
  const [resourceOverlayPrefs, setResourceOverlayPrefs] = useState<ResourceOverlayPrefs>(() =>
    loadResourceOverlayPrefs()
  )
  const [editorLanguagePrefs, setEditorLanguagePrefs] = useState<EditorLanguagePrefs>(() =>
    loadEditorLanguagePrefs()
  )
  const [modelRouterPrefs, setModelRouterPrefs] = useState<ModelRouterPrefs>(() =>
    loadModelRouterPrefs()
  )
  const fonts = useMemo(() => resolveAppearanceFonts(appearance), [appearance])
  const theme = useMemo(() => createVisionTheme(fonts.ui), [fonts.ui])

  useEffect(() => {
    applyAppearanceCssVars(appearance)
  }, [appearance])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ProcessProvider>
        <AppShell
          appearance={appearance}
          setAppearance={setAppearance}
          thinkingTimingPrefs={thinkingTimingPrefs}
          setThinkingTimingPrefs={setThinkingTimingPrefs}
          suggestedFilesPrefs={suggestedFilesPrefs}
          setSuggestedFilesPrefs={setSuggestedFilesPrefs}
          resourceOverlayPrefs={resourceOverlayPrefs}
          setResourceOverlayPrefs={setResourceOverlayPrefs}
          editorLanguagePrefs={editorLanguagePrefs}
          setEditorLanguagePrefs={setEditorLanguagePrefs}
          modelRouterPrefs={modelRouterPrefs}
          setModelRouterPrefs={setModelRouterPrefs}
        />
      </ProcessProvider>
    </ThemeProvider>
  )
}
