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
import ArticleIcon from '@mui/icons-material/Article'
import ChecklistRtlIcon from '@mui/icons-material/ChecklistRtl'
import GitHubIcon from '@mui/icons-material/GitHub'
import SettingsIcon from '@mui/icons-material/Settings'
import TerminalIcon from '@mui/icons-material/Terminal'
import CodeIcon from '@mui/icons-material/Code'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import { Alert, Box, Button, Chip, Paper, Snackbar, Stack, Typography } from '@mui/material'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { DISPLAY_CORE, ErrorSource, prefixForTechnicalLog, prefixForUserFacing } from './brand'
import { AppChrome } from './components/layout/AppChrome'
import { ResourceOverlay } from './components/layout/ResourceOverlay'
import {
  DEFAULT_CONFIG,
  DEFAULT_LAN_PROXY_PORT,
  defaultCoreApiUrl,
  type VisionConfig,
} from './ipc/config'
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
  normalizeAddCommandPath,
  parseAddCommandPath,
  pathsNotInChat,
} from './utils/suggestedFiles'
import {
  loadSuggestedFilesPrefs,
  PROCEED_AFTER_FILES_MESSAGE,
  saveSuggestedFilesPrefs,
  type SuggestedFilesPrefs,
} from './theme/suggestedFilesPrefs'
import { loadSpecFocusPref, saveSpecFocusPref } from './theme/specFocusPrefs'
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
import { applyProposedEditSegment } from './utils/applyProposedEdit'
import {
  isSessionLoadedToolOutput,
  transcriptToChatMessages,
  type TranscriptRow,
} from './utils/sessionTranscript'
import type { AssistantContentSegment } from './utils/proposedEdits'
import { normalizeRepoPath } from './utils/proposedEdits'
import { buildSpecTraceHint, defaultRefinePrompt, type SpecTraceHint } from './utils/specTraceHint'
import { truncatePromptPreview } from './utils/specGeneratePrompt'
import {
  sectionActivityLabel,
  type SpecLayerSection,
} from './utils/specWizard'
import type { TraceabilityResult } from './todos/earsTypes'
import { isRedundantEditToolOutput } from './utils/suppressDuplicateToolOutput'
import { appendTimingStatsCsvRow } from './ipc/timingStatsCsv'
import { ChatPanel, type ChatMessage, type ToolEvent } from './components/chat/ChatPanel'
import { SpecAgentPanel } from './components/spec/SpecAgentPanel'
import {
  resolveConnectionStatusLabel,
  resolveConnectionTone,
} from './utils/connectionStatus'
import { TodoPanel } from './components/todos/TodoPanel'
import { GitPanel } from './components/GitPanel'
import { useWorkspaceTodos, type SpecLayerDraft } from './hooks/useWorkspaceTodos'
import { WelcomePanel } from './components/onboarding/WelcomePanel'
import { AboutDialog } from './components/settings/AboutDialog'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { VisionApiActionButtons } from './components/settings/VisionApiActionButtons'
import { useVisionApiControls } from './hooks/useVisionApiControls'
import type { SubAgentInfo } from './ipc/agentCommands'

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
import {
  loadNtfyAlertsPrefs,
  saveNtfyAlertsPrefs,
  DEFAULT_NTFY_ALERTS_PREFS,
  generateNtfyTopic,
  type NtfyAlertsPrefs,
} from './theme/ntfyAlertsPrefs'
import { maybeNotifyTurnComplete, maybeNotifySpecJobComplete } from './ipc/ntfyAlerts'
import { useAppVersions } from './hooks/useAppVersions'
import { StderrBatcher } from './utils/stderrBatch'
import { useThinkingTiming } from './hooks/useThinkingTiming'
import { useSessionStallWatch } from './hooks/useSessionStallWatch'
import { useResourceOverlay } from './hooks/useResourceOverlay'
import {
  clearAllThinkingStats,
  clearModelThinkingStats,
  computeOutputTps,
  loadThinkingStats,
  saveThinkingStats,
} from './utils/thinkingStats'
import { estimateTurnEta } from './utils/turnEtaEstimate'
import { downloadSessionDebugBundle } from './utils/sessionDebugExport'
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
  applyLocalLlmHopperFromEnv,
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
  prepareModelRouterForSessionStart,
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
  NTFY_ALERTS_STORAGE_KEY,
  migrateLegacyStorageKeys,
  readStorageItem,
  removeStorageKeys,
} from './storageKeys'

const WELCOME_DISMISSED_KEY = 'vision-welcome-dismissed'

type TabId = 'chat' | 'spec' | 'terminal' | 'git' | 'editor' | 'settings' | 'tasks'

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
  if (typeof merged.sessionEncrypt !== 'boolean') {
    merged.sessionEncrypt = false
  }
  if (typeof merged.autoSaveSession !== 'boolean') {
    merged.autoSaveSession = false
  }
  if (typeof merged.autoLoadSession !== 'boolean') {
    merged.autoLoadSession = false
  }
  if (typeof merged.chatHistoryFile !== 'boolean') {
    merged.chatHistoryFile = true
  }
  if (typeof merged.autoSaveSessionName !== 'string' || !merged.autoSaveSessionName.trim()) {
    merged.autoSaveSessionName = 'brightvision'
  }
  if (merged.sessionMode !== 'vibe' && merged.sessionMode !== 'spec') {
    merged.sessionMode = 'vibe'
  }
  if (typeof merged.lanRemoteEnabled !== 'boolean') {
    merged.lanRemoteEnabled = false
  }
  if (typeof merged.lanProxyPort !== 'number' || merged.lanProxyPort < 1024) {
    merged.lanProxyPort = DEFAULT_LAN_PROXY_PORT
  }
  if (merged.coreEnginePath === 'bright-vision-core' || merged.coreEnginePath === 'BrightVision-core') {
    merged.coreEnginePath = '.'
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
  { id: 'spec', label: 'Spec', icon: <ArticleIcon /> },
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
  ntfyAlertsPrefs,
  setNtfyAlertsPrefs,
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
  ntfyAlertsPrefs: NtfyAlertsPrefs
  setNtfyAlertsPrefs: React.Dispatch<React.SetStateAction<NtfyAlertsPrefs>>
  editorLanguagePrefs: EditorLanguagePrefs
  setEditorLanguagePrefs: React.Dispatch<React.SetStateAction<EditorLanguagePrefs>>
  modelRouterPrefs: ModelRouterPrefs
  setModelRouterPrefs: React.Dispatch<React.SetStateAction<ModelRouterPrefs>>
}) {
  const ntfyAlertsPrefsRef = useRef(ntfyAlertsPrefs)
  ntfyAlertsPrefsRef.current = ntfyAlertsPrefs

  const [activeTab, setActiveTab] = useState<TabId>('chat')
  const [aboutOpen, setAboutOpen] = useState(false)
  const [editorPendingPath, setEditorPendingPath] = useState<string | null>(null)
  const [config, setConfig] = useState<VisionConfig>(DEFAULT_CONFIG)
  const [savedConfig, setSavedConfig] = useState<VisionConfig>(DEFAULT_CONFIG)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [specChatMessages, setSpecChatMessages] = useState<ChatMessage[]>([])
  const [specInputValue, setSpecInputValue] = useState('')
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
  const [specFocusMode, setSpecFocusMode] = useState(() => loadSpecFocusPref())
  const [specGenerating, setSpecGenerating] = useState(false)
  const [specIndexRefreshToken, setSpecIndexRefreshToken] = useState(0)
  const [specAgentEarsLinting, setSpecAgentEarsLinting] = useState(false)
  const [specAgentTracing, setSpecAgentTracing] = useState(false)
  const [specTraceHint, setSpecTraceHint] = useState<SpecTraceHint | null>(null)
  const [specJobPrompt, setSpecJobPrompt] = useState<string | null>(null)
  const [specJobMode, setSpecJobMode] = useState<'generate' | 'refine' | null>(null)
  const [specJobSection, setSpecJobSection] = useState<SpecLayerSection | null>(null)
  const [liveSessionMode, setLiveSessionMode] = useState<'vibe' | 'spec' | null>(null)
  const liveSessionModeRef = useRef<'vibe' | 'spec' | null>(null)
  const specGenerateAbortRef = useRef<AbortController | null>(null)
  const specLayersSavedRef = useRef<(id: string, layers: SpecLayerDraft) => void | Promise<void>>(
    () => {}
  )
  const chatEndRef = useRef<HTMLDivElement>(null)
  const specChatEndRef = useRef<HTMLDivElement>(null)
  const specTurnCaptureRef = useRef(false)
  const specStreamingAssistantId = useRef<number | null>(null)
  const specPendingUserMessageIdsRef = useRef<number[]>([])
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
  const specChatMessagesRef = useRef(specChatMessages)
  specChatMessagesRef.current = specChatMessages
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
  const [turnTokenUsage, setTurnTokenUsage] = useState<{
    tokensSent: number
    tokensReceived: number
  } | null>(null)
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
      resources?: import('./ipc/resourceSnapshot').TurnResourceStats,
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
    setTurnTokenUsage(null)
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
  const [subagents, setSubagents] = useState<SubAgentInfo[]>([])
  const [agentModeAvailable, setAgentModeAvailable] = useState(false)
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
    const stored = readStorageItem(CONFIG_STORAGE_KEY)
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
          setModelRouterPrefs((prefs) =>
            applyLocalLlmHopperFromEnv(prefs, localLlm, next.model, true)
          )
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

  const appendUserMessageToSpecChat = useCallback(
    (content: string, trackPending: boolean) => {
      const id = nextChatMessageId()
      if (trackPending) specPendingUserMessageIdsRef.current.push(id)
      setSpecChatMessages((prev) =>
        capList([...prev, { id, role: 'user' as const, content }], MAX_CHAT_MESSAGES)
      )
    },
    [nextChatMessageId]
  )

  const hydrateChatFromTranscript = useCallback(
    (rows: TranscriptRow[]) => {
      const mapped = transcriptToChatMessages(rows, nextChatMessageId)
      if (!mapped.length) return
      setChatMessages(capList(mapped, MAX_CHAT_MESSAGES))
      setToolEvents([])
    },
    [nextChatMessageId]
  )

  const httpClientRef = useRef<CoreHttpClient | null>(null)
  const sessionInfoIdRef = useRef<string | null>(null)
  const hydrateChatFromCoreRef = useRef<(client: CoreHttpClient, sessionId: string) => void>(
    () => {}
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
        const specCap = specTurnCaptureRef.current
        const pendingId = shiftPendingUserMessageId(
          specCap ? specPendingUserMessageIdsRef.current : pendingUserMessageIdsRef.current
        )
        const setMsgs = specCap ? setSpecChatMessages : setChatMessages
        setMsgs((prev) =>
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
        const specCap = specTurnCaptureRef.current
        const streamRef = specCap ? specStreamingAssistantId : streamingAssistantId
        const setMsgs = specCap ? setSpecChatMessages : setChatMessages
        let sid = streamRef.current
        if (sid === null) {
          sid = orderId
          streamRef.current = sid
          turnAssistantMessageIdRef.current = sid
          turnHadAssistantOutputRef.current = true
          setMsgs((prev) => {
            const next = capList(
              [...prev, { id: sid!, role: 'assistant' as const, content: chunk }],
              MAX_CHAT_MESSAGES
            )
            if (!specCap) thinkingTimingRef.current.syncContent(chunk)
            return next
          })
        } else {
          const captureSid = sid
          turnHadAssistantOutputRef.current = true
          setMsgs((prev) => {
            const next = capList(
              prev.map((m) => {
                if (m.id !== captureSid) return m
                const content = appendStreamingToken(m.content, chunk)
                if (!specCap) thinkingTimingRef.current.syncContent(content)
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
        const specCapRoute = specTurnCaptureRef.current
        const setRouteMsgs = specCapRoute ? setSpecChatMessages : setChatMessages
        setRouteMsgs((prev) =>
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
              setTurnTokenUsage({
                tokensSent: report.tokensSent,
                tokensReceived: report.tokensReceived,
              })
            }
          }
          break
        }
        if (!text.trim()) break
        if (isRedundantEditToolOutput(text, lastAssistantStreamRef.current)) break
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
        if (isSessionLoadedToolOutput(text)) {
          const client = httpClientRef.current
          const sid = sessionInfoIdRef.current
          if (client && sid) hydrateChatFromCoreRef.current(client, sid)
        }
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
        const specCapDone = specTurnCaptureRef.current
        const applied =
          ev.edited_files && Array.isArray(ev.edited_files)
            ? (ev.edited_files as string[])
            : []
        const wallStart = turnWallStartMsRef.current
        const turnAssistantId = turnAssistantMessageIdRef.current
        const hadAssistantOutput = turnHadAssistantOutputRef.current
        let turnTiming: TurnThinkingTiming | null = null
        if (wallStart != null) {
          const prev = specCapDone ? specChatMessagesRef.current : chatMessagesRef.current
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
              setTurnTokenUsage(null)
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
        if (turnTiming?.turnDurationMs) {
          void maybeNotifyTurnComplete(ntfyAlertsPrefsRef.current, {
            durationMs: turnTiming.turnDurationMs,
            queuedRemaining: queuedCountRef.current,
            editedCount: applied.length,
            documentVisible: document.visibilityState === 'visible',
          })
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
        const setDoneMsgs = specCapDone ? setSpecChatMessages : setChatMessages
        setDoneMsgs((prev) => {
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
        if (specCapDone) {
          specTurnCaptureRef.current = false
          specStreamingAssistantId.current = null
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
          }
          void reloadTodosRef.current()
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

  const removeLastPendingSpecUserMessage = useCallback(() => {
    const id = popPendingUserMessageId(specPendingUserMessageIdsRef.current)
    setSpecChatMessages((prev) => removeChatMessageById(prev, id))
  }, [])

  const onOutboundMessage = useCallback(
    (content: string) => {
      if (content.trim() === '/clear') return
      if (specTurnCaptureRef.current) {
        setSpecChatMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last?.role === 'user' && last.content === content) return prev
          const id = nextChatMessageId()
          specPendingUserMessageIdsRef.current.push(id)
          return capList([...prev, { id, role: 'user' as const, content }], MAX_CHAT_MESSAGES)
        })
      } else {
        appendUserMessageToChat(content, true)
      }
      startTurnTimingRef.current(content.length, Date.now())
    },
    [appendUserMessageToChat, nextChatMessageId]
  )

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
  } = useVisionSession(wrapHandler(handleCoreEvent), { onOutboundMessage })

  httpClientRef.current = httpClient
  sessionInfoIdRef.current = sessionInfo?.session_id ?? null
  hydrateChatFromCoreRef.current = (client, sessionId) => {
    void client
      .getSessionTranscript(sessionId)
      .then((rows) => {
        const typed: TranscriptRow[] = []
        for (const r of rows) {
          if (r.role === 'user' || r.role === 'assistant') {
            typed.push({ role: r.role, content: r.content })
          }
        }
        hydrateChatFromTranscript(typed)
      })
      .catch(() => {})
  }

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

  useEffect(() => {
    const client = httpClient
    const sid = sessionInfo?.session_id
    if (!client || !sid || !isRunning) {
      setSubagents([])
      setAgentModeAvailable(false)
      return
    }
    void client
      .listSubagents(sid)
      .then((data) => {
        setSubagents(data.subagents)
        setAgentModeAvailable(data.agent_mode_available)
      })
      .catch(() => {
        setSubagents([])
        setAgentModeAvailable(false)
      })
  }, [httpClient, sessionInfo?.session_id, isRunning])

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

  const stallWatch = useSessionStallWatch(isBusy, queuedCount, savedConfig.model)
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
    turnTokenUsageRef.current = null
    setTurnTokenUsage(null)
    resetTurnResourcePeak()
    setTrackTurnResources(true)
    thinkingTiming.beginTurn(promptChars, turnStartMs)
    turnTimingActiveRef.current = true
  }

  const turnEta = useMemo(() => {
    if (!thinkingTiming.live || !isRunning) return null
    const liveTps =
      turnTokenUsage && thinkingTiming.live.responseElapsedMs > 500
        ? computeOutputTps(turnTokenUsage.tokensReceived, thinkingTiming.live.responseElapsedMs)
        : null
    return estimateTurnEta({
      model: savedConfig.model,
      promptChars: lastUserPromptCharsRef.current,
      elapsedMs: thinkingTiming.live.responseElapsedMs,
      statsStore: thinkingTiming.statsStore,
      progressFraction: process.snapshot.progress,
      liveOutputTps: liveTps,
    })
  }, [
    thinkingTiming.live,
    thinkingTiming.statsStore,
    savedConfig.model,
    process.snapshot.progress,
    turnTokenUsage,
    isRunning,
  ])

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
    refreshDeps: [isRunning, httpClient, activeTab === 'settings', aboutOpen],
  })

  const workspaceTodosApi = useMemo(
    () => ({
      client: httpClient ?? todoApiClient,
      workspace: savedConfig.workingDir,
      sessionId: sessionInfo?.session_id ?? null,
    }),
    [httpClient, todoApiClient, savedConfig.workingDir, sessionInfo?.session_id]
  )

  const { paths: pathSuggestions, active: pathAssistActive } = usePathCompletion(
    savedConfig.workingDir,
    inputValue
  )
  const { paths: specPathSuggestions, active: specPathAssistActive } = usePathCompletion(
    savedConfig.workingDir,
    specInputValue
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
    lintRequirements,
    fetchSpecIndex,
    traceSpec,
    repairSpecFolders,
    pruneOrphanSpecFolders,
    setActiveTodo,
    markDone,
    recordTurnLinks,
    reload: reloadTodos,
    exportMarkdown,
    importMarkdown,
    httpReady: todosHttpReady,
    tauriLocal: todosTauriLocal,
  } = useWorkspaceTodos(savedConfig.workingDir, workspaceTodosApi, {
    onAutoCompleted: () => {
      setSnackbar({
        message: 'Task marked done — all checklist items complete',
        severity: 'info',
      })
      void reloadTodos()
    },
    onEarsRegression: (_id, errorCount) => {
      setSnackbar({
        message: `Requirements saved with ${errorCount} EARS error(s) — use Validate EARS`,
        severity: 'warning',
      })
    },
    onSpecLayersSaved: (id, layers) => {
      setSpecIndexRefreshToken((n) => n + 1)
      void specLayersSavedRef.current(id, layers)
    },
  })

  const applySpecTraceResult = useCallback((result: TraceabilityResult, opts?: { afterSave?: boolean }) => {
    setSpecTraceHint(buildSpecTraceHint(result))
    const prefix = opts?.afterSave ? 'Spec trace after save' : 'Trace'
    if (result.ok && result.warning_count === 0) {
      setSnackbar({
        message: `${prefix}: ${result.req_ids.length} REQ id(s)`,
        severity: 'info',
      })
      return
    }
    const parts: string[] = []
    if (result.error_count > 0) parts.push(`${result.error_count} error(s)`)
    if (result.warning_count > 0) parts.push(`${result.warning_count} warning(s)`)
    setSnackbar({
      message: parts.length ? `${prefix}: ${parts.join(', ')}` : `${prefix} reported issues`,
      severity: result.error_count > 0 ? 'warning' : 'info',
    })
  }, [])

  specLayersSavedRef.current = async (id, layers) => {
    if (liveSessionModeRef.current !== 'spec' || !todosHttpReady) return
    const item = todoStore?.todos.find((t) => t.id === id)
    if (!item) return
    try {
      const result = await traceSpec(id, {
        requirements: layers.requirements ?? item.requirements ?? '',
        design: layers.design ?? item.design ?? '',
        tasks_md: layers.tasks_md ?? item.tasks_md ?? '',
      })
      applySpecTraceResult(result, { afterSave: true })
    } catch {
      // trace on save is best-effort
    }
  }

  useEffect(() => {
    setSpecTraceHint(null)
  }, [activeTodo?.id])

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
    const normalized = path.replace(/^@+/, '').replace(/\\/g, '/').trim()
    if (!normalized) return
    setEditorPendingPath(normalized)
    setActiveTab('editor')
  }, [])

  const handleApplyProposedEdit = useCallback(
    async (
      messageId: number,
      segment: Extract<AssistantContentSegment, { type: 'proposed_edit' }>
    ) => {
      const result = await applyProposedEditSegment(savedConfigRef.current.workingDir, segment)
      if (!result.ok) {
        setSnackbar({ message: result.message, severity: 'error' })
        return
      }
      if (result.path) {
        setChatMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId || m.role !== 'assistant') return m
            const paths = new Set([...(m.appliedFiles ?? []), normalizeRepoPath(result.path!)])
            return { ...m, appliedFiles: [...paths] }
          })
        )
        handleOpenInEditor(result.path)
      }
      setSnackbar({ message: result.message, severity: 'info' })
    },
    [handleOpenInEditor]
  )

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
    if (activeTab === 'spec') specChatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [specChatMessages, activeTab])

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [terminalLines])

  liveSessionModeRef.current = liveSessionMode

  const handleSessionModeChange = useCallback(
    (sessionMode: 'vibe' | 'spec') => {
      setConfig((c) => ({ ...c, sessionMode }))
      setSavedConfig((c) => {
        const next = { ...c, sessionMode }
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next))
        return next
      })
      if (!lifecycleActive && sessionMode === 'spec') {
        setActiveTab('spec')
      }
    },
    [lifecycleActive]
  )

  const handleSave = () => {
    const modelChanged = config.model.trim() !== savedConfig.model.trim()
    setSavedConfig(config)
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config))
    saveAppearance(appearance)
    saveThinkingTimingPrefs(thinkingTimingPrefs)
    saveResourceOverlayPrefs(resourceOverlayPrefs)
    saveNtfyAlertsPrefs(ntfyAlertsPrefs)
    saveEditorLanguagePrefs(editorLanguagePrefs)
    saveModelRouterPrefs(modelRouterPrefs)
    if (isRunning && modelChanged && sessionInfo) {
      setSnackbar({
        message:
          'LLM model updated in Settings — use Stop & Start in Chat to apply (no app restart needed).',
        severity: 'warning',
      })
    } else {
      setSnackbar({ message: 'Settings saved', severity: 'info' })
    }
  }

  const handleRestartSession = async () => {
    try {
      await handleStop()
      await handleStart()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setSnackbar({ message: msg, severity: 'error' })
    }
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
      NTFY_ALERTS_STORAGE_KEY,
    ])
    setAppearance({ ...DEFAULT_APPEARANCE })
    applyAppearanceCssVars(DEFAULT_APPEARANCE)
    setThinkingTimingPrefs({ ...DEFAULT_THINKING_TIMING_PREFS })
    setResourceOverlayPrefs({ ...DEFAULT_RESOURCE_OVERLAY_PREFS })
    setNtfyAlertsPrefs({ ...DEFAULT_NTFY_ALERTS_PREFS, topic: generateNtfyTopic() })
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

  const visionApiControls = useVisionApiControls(savedConfig, {
    sessionActive: lifecycleActive,
    onLogLines: appendTerminalLog,
    onApiUrl: (url) => {
      const next = { ...savedConfig, coreApiUrl: url }
      setSavedConfig(next)
      setConfig(next)
    },
  })

  const ensureLocalLlm = async (): Promise<void> => {
    if (!isTauriRuntime() || !savedConfig.manageLocalLlm || !isOllamaVisionModel(savedConfig.model)) {
      return
    }
    const { ollamaHost, modelTag } = resolveLocalLlmForConfig(savedConfig)
    if (!modelTag) return
    process.apply({
      phase: 'booting_api',
      label: 'Starting Local LLM',
      detail: `${modelTag} @ ${ollamaHost}`,
      progress: 0.1,
    })
    try {
      const s = await invoke<LocalLlmRuntimeStatus>('local_llm_start_plain', {
        ollamaHost,
        modelTag,
      })
      appendTerminalLog(s.logs.map((l) => `[local-llm] ${l}`))
      process.apply({
        phase: 'booting_api',
        label: 'Local LLM ready',
        detail: modelTag,
        progress: 0.22,
      })
      if (modelRouterPrefs.enabled) {
        process.apply({
          phase: 'booting_api',
          label: 'Router models',
          detail: 'Pull fast/heavy tags only (no extra preload)',
          progress: 0.28,
        })
        const hopperLogs = await prepareModelRouterForSessionStart(
          savedConfig,
          modelRouterPrefs
        )
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
    if (config.model.trim() !== savedConfig.model.trim()) {
      setSnackbar({
        message: 'Save Settings before Start so the new LLM model is used.',
        severity: 'warning',
      })
      return
    }
    try {
      await ensureLocalLlm()
      const routerPayload = modelRouterApiPayload(modelRouterPrefs, savedConfig.model)
      const { info, workingDir, transcript = [] } = await start(savedConfig, {
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
      const restored: TranscriptRow[] = []
      for (const r of transcript) {
        if (r.role === 'user' || r.role === 'assistant') {
          restored.push({ role: r.role, content: r.content })
        }
      }
      if (restored.length) {
        hydrateChatFromTranscript(restored)
      } else {
        setChatMessages([])
        setToolEvents([])
      }
      setTerminalLines([
        {
          id: Date.now(),
          text: `${prefixForUserFacing('vision')} Started ${DISPLAY_CORE} (${savedConfig.sessionMode} session ${info.session_id.slice(0, 8)}…).`,
          type: 'stdout',
          source: 'vision',
        },
      ])
      if (savedConfig.sessionMode === 'spec') {
        setActiveTab('spec')
        setSpecFocusMode(true)
        saveSpecFocusPref(true)
      }
      const files = info.files_in_chat?.length ? info.files_in_chat.join(', ') : '(repo map)'
      setStatusMessage(`Session active — ${files}`)
      setLiveSessionMode(savedConfig.sessionMode)
      dismissWelcome()
      if (savedConfig.sessionMode !== 'spec') {
        setActiveTab('chat')
      }
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
      setLiveSessionMode(null)
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

  const handleExportSessionDebug = useCallback(async () => {
    const sid = sessionInfo?.session_id
    const client = httpClient ?? todoApiClient
    if (!sid) {
      setSnackbar({ message: 'Start a session before exporting debug data', severity: 'info' })
      return
    }
    try {
      await downloadSessionDebugBundle(client, sid)
      setSnackbar({
        message: 'Session debug bundle downloaded (share when reporting tool-call issues)',
        severity: 'info',
      })
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      })
    }
  }, [sessionInfo?.session_id, httpClient, todoApiClient])

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
      let merged: SendMessageOptions | undefined = todoOptions
        ? { activeTodoId: todoOptions.activeTodoId, injectTodoSpec: todoOptions.injectTodoSpec }
        : undefined
      if (specFocusMode && activeTodo) {
        merged = {
          ...merged,
          specFocus: true,
          activeTodoId: merged?.activeTodoId ?? activeTodo.id,
          injectTodoSpec: Boolean(merged?.injectTodoSpec ?? todoOptions?.injectTodoSpec),
        }
      }
      const result = await send(text, { ...merged, ...sendExtras })
      if (result.queued) {
        const trimmed = text.trim()
        setSnackbar({
          message:
            trimmed.toLowerCase() === 'proceed'
              ? '“proceed” is queued — the current turn is still running; the model has not received it yet.'
              : 'Queued — will send when the agent finishes the current turn',
          severity: 'info',
        })
      }
      return result
    },
    [send, stallWatch, specFocusMode, activeTodo]
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
    try {
      await deliverUserMessage(msg)
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
  }, [isRunning, deliverUserMessage, removeLastPendingUserMessage, stallWatch])

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
    async (
      todoId: string,
      prompt: string,
      mode: 'generate' | 'refine',
      options?: { section?: SpecLayerSection | 'all'; contextPaths?: string[] }
    ) => {
      const sid = sessionInfo?.session_id
      const client = httpClient ?? todoApiClient
      if (!sid || !isRunning) {
        setSnackbar({ message: 'Start a session to generate specs with AI', severity: 'info' })
        return
      }
      const section = options?.section ?? 'all'
      specGenerateAbortRef.current?.abort()
      const ac = new AbortController()
      specGenerateAbortRef.current = ac
      setSpecGenerating(true)
      setSpecJobMode(mode)
      setSpecJobSection(section === 'all' ? null : section)
      setSpecJobPrompt(prompt)
      const phaseLabel =
        mode === 'refine'
          ? 'REFINING SPEC'
          : section !== 'all'
            ? sectionActivityLabel(section)
            : 'GENERATING SPEC'
      setSnackbar({
        message: `${phaseLabel}: ${truncatePromptPreview(prompt, 96)}`,
        severity: 'info',
      })
      const jobStartedMs = Date.now()
      const taskTitle = todoStore?.todos.find((t) => t.id === todoId)?.title
      const notifySpecJob = (outcome: 'saved' | 'ears_blocked' | 'error') => {
        void maybeNotifySpecJobComplete(ntfyAlertsPrefsRef.current, {
          durationMs: Date.now() - jobStartedMs,
          documentVisible: document.visibilityState === 'visible',
          mode,
          section,
          taskTitle,
          outcome,
        })
      }
      try {
        const gen = await client.generateWorkspaceTodoSpec(
          savedConfig.workingDir,
          sid,
          todoId,
          {
            prompt,
            mode,
            section,
            context_paths: options?.contextPaths ?? [],
            apply: true,
            enforce_ears: true,
            background: true,
          },
          ac.signal
        )
        await reloadTodos()
        if (gen.ears_blocked) {
          notifySpecJob('ears_blocked')
          setSnackbar({
            message:
              'Spec draft returned but not saved — fix EARS errors (Validate EARS), then refine again',
            severity: 'warning',
          })
        } else {
          notifySpecJob('saved')
          setSpecIndexRefreshToken((n) => n + 1)
          setSpecTraceHint(null)
          setSnackbar({
            message:
              mode === 'refine'
                ? 'Spec refined and saved'
                : section === 'requirements'
                  ? 'Requirements generated and saved'
                  : section === 'design'
                    ? 'Design generated and saved'
                    : section === 'tasks_md'
                      ? 'Implementation tasks generated and saved'
                      : 'Spec generated and saved',
            severity: 'info',
          })
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        notifySpecJob('error')
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
        setSpecJobPrompt(null)
        setSpecJobMode(null)
        setSpecJobSection(null)
      }
    },
    [sessionInfo?.session_id, httpClient, todoApiClient, isRunning, savedConfig.workingDir, reloadTodos, todoStore?.todos]
  )

  const handleRefineWithTraceHint = useCallback(() => {
    if (!activeTodo) return
    const prompt = specTraceHint?.refinePrompt ?? defaultRefinePrompt()
    void handleGenerateSpec(activeTodo.id, prompt, 'refine', { contextPaths: filesInChat })
  }, [activeTodo, specTraceHint, handleGenerateSpec, filesInChat])

  const handleAddContextPath = useCallback(
    async (path: string) => {
      if (!isRunning) {
        setSnackbar({ message: 'Start a session to add files to context', severity: 'info' })
        return
      }
      const trimmed = path.trim().replace(/^@/, '')
      if (!trimmed) return
      const normalized = normalizeAddCommandPath(trimmed) ?? trimmed
      try {
        const info = await addFiles([normalized])
        await applyFilesAdded([normalized], info, `Added ${normalized} to session context`)
      } catch (err) {
        setSnackbar({
          message: err instanceof Error ? err.message : String(err),
          severity: 'error',
        })
      }
    },
    [isRunning, addFiles, applyFilesAdded]
  )

  const handleSpecSend = async () => {
    if (!specInputValue.trim() || !isRunning || !activeTodo) return
    const text = specInputValue.trim()
    const addPath = parseAddCommandPath(text)
    if (addPath) {
      setSpecInputValue('')
      try {
        const info = await addFiles([addPath])
        await applyFilesAdded([addPath], info, `Added ${addPath} to session context`)
      } catch (err) {
        setSpecInputValue(text)
        setSnackbar({
          message: err instanceof Error ? err.message : String(err),
          severity: 'error',
        })
      }
      return
    }
    setSpecInputValue('')
    rememberUserMessageForRetry(text)
    specTurnCaptureRef.current = true
    appendUserMessageToSpecChat(text, true)
    const todoOptions = { activeTodoId: activeTodo.id, injectTodoSpec: true }
    try {
      const result = await deliverUserMessage(text, todoOptions, {
        specFocus: true,
        preproc: false,
      })
      if (result.queued) {
        setSnackbar({
          message: 'Spec message queued — will send when the current turn finishes',
          severity: 'info',
        })
      } else {
        void reloadTodos()
      }
    } catch (err) {
      specTurnCaptureRef.current = false
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
      removeLastPendingSpecUserMessage()
      setSpecInputValue(text)
      setSnackbar({
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      })
    }
  }

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
      if (!result.queued) {
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

  const handleClearChatHistory = useCallback(async () => {
    if (chatMessages.length === 0 && toolEvents.length === 0) return
    const syncCore = isRunning
    if (
      !window.confirm(
        syncCore
          ? 'Clear all messages and tool output from this view, and send /clear so the agent forgets prior turns?\n\nFiles stay in context (/drop to remove). File edits are not undone.'
          : 'Clear all messages and tool output from this view? File edits are not undone.'
      )
    ) {
      return
    }
    setChatMessages([])
    setToolEvents([])
    streamingAssistantId.current = null
    turnAssistantMessageIdRef.current = null
    pendingUserMessageIdsRef.current = []
    setTokenStats(null)
    setSuggestedPaths([])
    setSuggestedAwaitingProceed(false)

    if (!syncCore) return
    try {
      const result = await send('/clear')
      if (result.queued) {
        setSnackbar({
          message: 'View cleared; /clear will run when the current turn finishes',
          severity: 'info',
        })
      }
    } catch (err) {
      setSnackbar({
        message:
          err instanceof Error
            ? `View cleared, but /clear failed: ${err.message}`
            : `View cleared, but /clear failed: ${String(err)}`,
        severity: 'warning',
      })
    } finally {
      // /clear SSE may append tool_output; keep the clear control disabled.
      setToolEvents([])
    }
  }, [chatMessages.length, toolEvents.length, isRunning, send])

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

  const connectionTone = resolveConnectionTone({
    isStarting,
    isRunning,
    apiReachable: visionApiControls.apiReachable,
  })

  const headerExtra = (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ maxWidth: 320 }}
        noWrap
        data-testid="session-status"
      >
        {resolveConnectionStatusLabel({
          statusMessage,
          isStarting,
          isRunning,
          apiReachable: visionApiControls.apiReachable,
        })}
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
      {specGenerating && (
        <Chip
          label="Spec job running"
          size="small"
          color="info"
          variant="outlined"
          data-testid="spec-generating-chip"
          onDelete={() => specGenerateAbortRef.current?.abort()}
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
        specJob={
          specGenerating
            ? {
                active: true,
                label:
                  specJobMode === 'refine'
                    ? 'REFINING SPEC'
                    : specJobSection
                      ? sectionActivityLabel(specJobSection)
                      : 'GENERATING SPEC',
                detail: specJobPrompt
                  ? truncatePromptPreview(specJobPrompt, 96)
                  : 'Background job on Vision API',
              }
            : null
        }
        liveTiming={thinkingTiming.live}
        turnEta={turnEta}
        headerExtra={headerExtra}
        connectionTone={connectionTone}
        onLogoClick={() => setAboutOpen(true)}
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
                onOpenSpec={() => setActiveTab('spec')}
                onStart={() => void handleStart()}
                onDismiss={dismissWelcome}
              />
            )}
            <ChatPanel
              messages={chatMessages}
              toolEvents={toolEvents}
              modelSwitchBanner={
                isRunning &&
                sessionInfo &&
                sessionInfo.model.trim() !== savedConfig.model.trim()
                  ? {
                      activeModel: sessionInfo.model,
                      settingsModel: savedConfig.model,
                      onRestart: () => void handleRestartSession(),
                      restarting: lifecycleActive,
                    }
                  : undefined
              }
              easyStart={
                !isRunning && !showWelcome
                  ? {
                      onStart: () => void handleStart(),
                      starting: lifecycleActive,
                      startLabel: process.snapshot.label,
                      startDetail: process.snapshot.detail,
                      disabled: !savedConfig.workingDir?.trim(),
                      disabledReason: !savedConfig.workingDir?.trim()
                        ? 'Choose a project folder in Settings or Welcome first.'
                        : undefined,
                      llmModel: config.model,
                      showLocalLlmStep:
                        isTauriRuntime() &&
                        config.manageLocalLlm &&
                        isOllamaVisionModel(config.model),
                    }
                  : undefined
              }
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
              onClearHistory={handleClearChatHistory}
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
              canApplyEdits={isTauriRuntime()}
              onApplyProposedEdit={
                isTauriRuntime() ? (id, seg) => handleApplyProposedEdit(id, seg) : undefined
              }
              modelRouterEnabled={modelRouterActive}
              lastModelRoute={lastModelRoute}
              routerEscalateOffer={routerEscalateOffer}
              onEscalateRouter={() => void handleEscalateRouter()}
              onForceRouterTier={(tier) => void handleForceRouterTier(tier)}
              onDismissRouterEscalate={() => setRouterEscalateOffer(null)}
              subagents={subagents}
              agentModeAvailable={agentModeAvailable}
              suppressEmptyHint={showWelcome}
            />
            </>
          )}

          {activeTab === 'spec' && (
            <SpecAgentPanel
              messages={specChatMessages}
              inputValue={specInputValue}
              isRunning={isRunning}
              isBusy={isBusy}
              sessionReady={isRunning && Boolean(sessionInfo?.session_id) && todosHttpReady}
              activeTodo={activeTodo}
              sessionMode={savedConfig.sessionMode}
              liveSessionMode={liveSessionMode}
              sessionRunning={isRunning}
              onSessionModeChange={handleSessionModeChange}
              specGenerating={specGenerating}
              specJobPrompt={specJobPrompt}
              earsLinting={specAgentEarsLinting}
              specTracing={specAgentTracing}
              chatEndRef={specChatEndRef}
              onInputChange={setSpecInputValue}
              onSend={() => void handleSpecSend()}
              onCancelSend={handleCancelSend}
              onOpenTasks={() => setActiveTab('tasks')}
              onClearHistory={() => setSpecChatMessages([])}
              commands={commands}
              pathSuggestions={specPathSuggestions}
              pathAssistActive={specPathAssistActive}
              onPickCommand={(cmd) => setSpecInputValue(cmd)}
              contextFiles={sessionFiles}
              contextUsage={contextUsage}
              onOpenContextInEditor={
                isTauriRuntime() ? (path) => handleOpenInEditor(path) : undefined
              }
              onAttachContextDirectory={
                isTauriRuntime() ? () => void handleAttachContextDirectory() : undefined
              }
              onAttachFolderPath={
                !isTauriRuntime() ? (path) => void handleAttachFolderPath(path) : undefined
              }
              onGenerateSpec={
                activeTodo && isRunning
                  ? (prompt) =>
                      void handleGenerateSpec(activeTodo.id, prompt, 'generate', {
                        contextPaths: sessionFiles,
                      })
                  : undefined
              }
              onRefineSpec={
                activeTodo && isRunning
                  ? (prompt) =>
                      void handleGenerateSpec(activeTodo.id, prompt, 'refine', {
                        contextPaths: sessionFiles,
                      })
                  : undefined
              }
              traceHint={specTraceHint}
              onRefineWithHint={
                activeTodo && isRunning ? () => handleRefineWithTraceHint() : undefined
              }
              onDismissTraceHint={() => setSpecTraceHint(null)}
              onValidateEars={
                activeTodo && todosHttpReady
                  ? () => {
                      setSpecAgentEarsLinting(true)
                      void lintRequirements(activeTodo.id, activeTodo.requirements ?? '')
                        .then((r) => {
                          setSnackbar({
                            message: r.ok
                              ? 'EARS OK for active task requirements'
                              : `${r.error_count} EARS error(s) on requirements`,
                            severity: r.ok ? 'info' : 'warning',
                          })
                        })
                        .catch((err) => {
                          setSnackbar({
                            message: err instanceof Error ? err.message : String(err),
                            severity: 'error',
                          })
                        })
                        .finally(() => setSpecAgentEarsLinting(false))
                    }
                  : undefined
              }
              onTraceSpec={
                activeTodo && todosHttpReady
                  ? () => {
                      setSpecAgentTracing(true)
                      void traceSpec(activeTodo.id, {
                        requirements: activeTodo.requirements ?? '',
                        design: activeTodo.design ?? '',
                        tasks_md: activeTodo.tasks_md ?? '',
                      })
                        .then((r) => applySpecTraceResult(r))
                        .catch((err) => {
                          setSnackbar({
                            message: err instanceof Error ? err.message : String(err),
                            severity: 'error',
                          })
                        })
                        .finally(() => setSpecAgentTracing(false))
                    }
                  : undefined
              }
            />
          )}

          {activeTab === 'tasks' && (
            <TodoPanel
              loading={todosLoading}
              todos={todoStore?.todos ?? []}
              activeId={todoStore?.activeId ?? null}
              templates={todoStore?.templates}
              onCreate={(title, spec, template) => void createTodo(title, spec, template)}
              onUpdate={(id, patch) => void updateTodo(id, patch)}
              onDelete={(id) => {
                void (async () => {
                  try {
                    await deleteTodo(id)
                    setSnackbar({ message: 'Task deleted', severity: 'info' })
                  } catch (err) {
                    setSnackbar({
                      message: err instanceof Error ? err.message : String(err),
                      severity: 'error',
                    })
                  }
                })()
              }}
              onMoveTodo={(id, dir) => void moveTodo(id, dir)}
              onSyncSpecFromDisk={async (id) => {
                try {
                  await syncSpecFromDisk(id)
                  setSpecIndexRefreshToken((n) => n + 1)
                  setSnackbar({ message: 'Spec layers loaded from disk', severity: 'info' })
                } catch (err) {
                  setSnackbar({
                    message: err instanceof Error ? err.message : String(err),
                    severity: 'error',
                  })
                }
              }}
              onLintRequirements={(id, draft) => lintRequirements(id, draft)}
              onFetchSpecIndex={
                todosHttpReady ? () => fetchSpecIndex() : undefined
              }
              onRepairSpecFolders={
                todosHttpReady || todosTauriLocal
                  ? async () => {
                      const r = await repairSpecFolders()
                      setSnackbar({
                        message:
                          r.created_count > 0
                            ? `Created ${r.created_count} spec folder(s) and synced markdown`
                            : 'Spec folders synced from tasks',
                        severity: 'info',
                      })
                      return r
                    }
                  : undefined
              }
              onPruneOrphanSpecFolders={
                todosHttpReady || todosTauriLocal
                  ? async () => {
                      const r = await pruneOrphanSpecFolders()
                      setSnackbar({
                        message:
                          r.removed_count > 0
                            ? `Removed ${r.removed_count} orphan spec folder(s)`
                            : 'No orphan spec folders found',
                        severity: 'info',
                      })
                      return r
                    }
                  : undefined
              }
              specFocusMode={specFocusMode}
              onSpecFocusChange={(on) => {
                setSpecFocusMode(on)
                saveSpecFocusPref(on)
                setSnackbar({
                  message: on
                    ? 'Spec focus on — chat will inject steering + active task spec'
                    : 'Spec focus off',
                  severity: 'info',
                })
              }}
              onTraceSpec={
                todosHttpReady
                  ? (id, draft) =>
                      traceSpec(id, {
                        requirements: draft.requirements,
                        design: draft.design,
                        tasks_md: draft.tasks_md,
                      })
                  : undefined
              }
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
              specIndexRefreshToken={specIndexRefreshToken}
              onGenerateSpec={(id, prompt, mode, opts) => handleGenerateSpec(id, prompt, mode, opts)}
              contextPaths={sessionFiles}
              contextUsage={contextUsage}
              onOpenSpec={() => setActiveTab('spec')}
              onAddContextPath={(path) => void handleAddContextPath(path)}
              onOpenContextInEditor={
                isTauriRuntime() ? (path) => handleOpenInEditor(path) : undefined
              }
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
                <Box sx={{ mt: 1.5 }}>
                  <VisionApiActionButtons
                    controls={visionApiControls}
                    sessionActive={lifecycleActive}
                  />
                </Box>
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
                onOpenInEditor={
                  isTauriRuntime() ? (path) => handleOpenInEditor(path) : undefined
                }
                onRevertFile={
                  isTauriRuntime()
                    ? async (path) => {
                        const { gitRestoreWorktreePaths } = await import('./ipc/gitStatus')
                        try {
                          await gitRestoreWorktreePaths(savedConfig.workingDir, [path])
                          bumpGitRefresh()
                          setSnackbar({ message: `Reverted ${path}`, severity: 'info' })
                        } catch (err) {
                          setSnackbar({
                            message: err instanceof Error ? err.message : String(err),
                            severity: 'error',
                          })
                        }
                      }
                    : undefined
                }
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
              <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
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
              </Box>
            </Suspense>
          )}

          {activeTab === 'settings' && (
            <Box sx={{ width: '100%', minWidth: 0 }}>
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
                ntfyAlertsPrefs={ntfyAlertsPrefs}
                onNtfyAlertsPrefsChange={setNtfyAlertsPrefs}
                suggestedFilesPrefs={suggestedFilesPrefs}
                onSuggestedFilesPrefsChange={handleSuggestedFilesPrefsChange}
                editorLanguagePrefs={editorLanguagePrefs}
                onEditorLanguagePrefsChange={handleEditorLanguagePrefsChange}
                modelRouterPrefs={modelRouterPrefs}
                onModelRouterPrefsChange={handleModelRouterPrefsChange}
                sessionModel={config.model}
                onSessionModeChange={handleSessionModeChange}
                liveSessionMode={liveSessionMode}
                onSave={handleSave}
                onReset={handleReset}
                appVersions={appVersions}
                subagents={subagents}
                agentModeAvailable={agentModeAvailable}
                sessionActive={isRunning}
                sessionId={sessionInfo?.session_id}
                onExportSessionDebug={handleExportSessionDebug}
              />
            </Box>
          )}
      </AppChrome>

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} versions={appVersions} />

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
  const [ntfyAlertsPrefs, setNtfyAlertsPrefs] = useState<NtfyAlertsPrefs>(() =>
    loadNtfyAlertsPrefs()
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
          ntfyAlertsPrefs={ntfyAlertsPrefs}
          setNtfyAlertsPrefs={setNtfyAlertsPrefs}
          editorLanguagePrefs={editorLanguagePrefs}
          setEditorLanguagePrefs={setEditorLanguagePrefs}
          modelRouterPrefs={modelRouterPrefs}
          setModelRouterPrefs={setModelRouterPrefs}
        />
      </ProcessProvider>
    </ThemeProvider>
  )
}
