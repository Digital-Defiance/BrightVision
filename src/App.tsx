import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import ChatIcon from '@mui/icons-material/Chat'
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
import { type CoreEventBase } from './ipc/events'
import { isTauriRuntime } from './ipc/isTauri'
import { useAiderSession } from './hooks/useAiderSession'
import { useCommandCatalog } from './hooks/useCommandCatalog'
import { useGitStatus } from './hooks/useGitStatus'
import { useSessionActivity } from './hooks/useSessionActivity'
import { ChatPanel, type ChatMessage, type ToolEvent } from './components/chat/ChatPanel'
import { GitPanel } from './components/GitPanel'
import { WelcomePanel } from './components/onboarding/WelcomePanel'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { useProcess } from './progress/processStore'

const WELCOME_DISMISSED_KEY = 'vision-welcome-dismissed'

type TabId = 'chat' | 'terminal' | 'git' | 'settings'

function migrateConfig(raw: Partial<AiderConfig> & Record<string, unknown>): AiderConfig {
  const merged: AiderConfig = { ...DEFAULT_CONFIG, ...raw }
  if (raw.coreRepoPath && typeof raw.coreRepoPath === 'string') {
    merged.coreEnginePath = raw.coreRepoPath
  }
  if (!Array.isArray(merged.contextFiles)) {
    merged.contextFiles = []
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
  { id: 'terminal', label: 'Terminal', icon: <TerminalIcon /> },
  { id: 'git', label: 'Git', icon: <GitHubIcon /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
]

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('chat')
  const [config, setConfig] = useState<AiderConfig>(DEFAULT_CONFIG)
  const [savedConfig, setSavedConfig] = useState<AiderConfig>(DEFAULT_CONFIG)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([])
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([])
  const [inputValue, setInputValue] = useState('')
  const [remainingAutoApproves, setRemainingAutoApproves] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'error' | 'info' } | null>(
    null
  )
  const [showWelcome, setShowWelcome] = useState(
    () => localStorage.getItem(WELCOME_DISMISSED_KEY) !== '1'
  )
  const [engineInstallPath, setEngineInstallPath] = useState<string | undefined>()
  const [gitRefreshKey, setGitRefreshKey] = useState(0)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const terminalEndRef = useRef<HTMLDivElement>(null)
  const streamingAssistantId = useRef<number | null>(null)
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

  const handleCoreEvent = useCallback((ev: CoreEventBase) => {
    process.ingestCoreEvent(ev)
    if (ev.type === 'done') bumpGitRefresh()
    const id = Date.now()

    switch (ev.type) {
      case 'user_message':
        setChatMessages((prev) => [
          ...prev,
          { id, role: 'user', content: String(ev.text ?? '') },
        ])
        break
      case 'token': {
        const chunk = String(ev.text ?? '')
        if (!chunk) break
        if (streamingAssistantId.current === null) {
          streamingAssistantId.current = id
          setChatMessages((prev) => [...prev, { id, role: 'assistant', content: chunk }])
        } else {
          const sid = streamingAssistantId.current
          setChatMessages((prev) =>
            prev.map((m) => (m.id === sid ? { ...m, content: m.content + chunk } : m))
          )
        }
        break
      }
      case 'tool_output':
      case 'tool_error':
      case 'tool_warning':
        setToolEvents((prev) => [
          ...prev,
          {
            id,
            type: 'tool_result',
            name: ev.type,
            output: String(ev.text ?? ''),
          },
        ])
        setTerminalLines((prev) => [
          ...prev,
          { id, text: `[${ev.type}] ${ev.text ?? ''}`, type: 'stdout' },
        ])
        break
      case 'confirm':
        setTerminalLines((prev) => [
          ...prev,
          {
            id,
            text: `[confirm] ${ev.question ?? ''}${ev.auto_answered ? ' (auto)' : ''}`,
            type: 'stdout',
          },
        ])
        break
      case 'done':
        streamingAssistantId.current = null
        setStatusMessage('Ready')
        if (ev.edited_files && Array.isArray(ev.edited_files) && ev.edited_files.length > 0) {
          setTerminalLines((prev) => [
            ...prev,
            {
              id,
              text: `Edited: ${(ev.edited_files as string[]).join(', ')}`,
              type: 'stdout',
            },
          ])
        }
        if (ev.commit_hash) {
          setTerminalLines((prev) => [
            ...prev,
            {
              id: id + 1,
              text: `Commit ${ev.commit_hash}: ${ev.commit_message ?? ''}`,
              type: 'stdout',
            },
          ])
        }
        break
      case 'error':
        streamingAssistantId.current = null
        setTerminalLines((prev) => [
          ...prev,
          {
            id,
            text: `${prefixForUserFacing('core')} ${ev.text ?? 'Unknown error'}`,
            type: 'stderr',
            source: 'core',
            channel: 'user',
          },
        ])
        setChatMessages((prev) => [
          ...prev,
          {
            id,
            role: 'system',
            content: `${prefixForUserFacing('core')} ${ev.text ?? 'Unknown error'}`,
          },
        ])
        break
      default:
        setTerminalLines((prev) => [
          ...prev,
          { id, text: JSON.stringify(ev), type: 'stdout' },
        ])
    }
  }, [process, bumpGitRefresh])

  const { pendingConfirm, dismissConfirm, lastGit, setFilesInChat, wrapHandler } =
    useSessionActivity()
  const { isRunning, isBusy, sessionInfo, httpClient, start, stop, send, undo } = useAiderSession(
    wrapHandler(handleCoreEvent)
  )
  const { commands } = useCommandCatalog(httpClient, sessionInfo?.session_id ?? null)
  const {
    status: gitStatus,
    loading: gitLoading,
    refresh: refreshGit,
  } = useGitStatus(savedConfig.workingDir, gitRefreshKey, isRunning)

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
    setSnackbar({ message: 'Settings saved', severity: 'info' })
  }

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG)
    setSavedConfig(DEFAULT_CONFIG)
    localStorage.removeItem('aider-vision-config')
  }

  const handleStart = async () => {
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
      streamingAssistantId.current = null
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

  const handleSend = async () => {
    if (!inputValue.trim() || !isRunning) return
    try {
      await send(inputValue)
      if (remainingAutoApproves > 0) {
        setRemainingAutoApproves((prev) => Math.max(0, prev - 1))
      }
      setInputValue('')
    } catch (err) {
      setSnackbar({
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      })
    }
  }

  const handleUndo = async () => {
    try {
      await undo()
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
      <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 280 }} noWrap>
        {statusMessage || (isRunning ? 'Session live' : 'Stopped')}
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
              pendingConfirm={pendingConfirm}
              chatEndRef={chatEndRef}
              onInputChange={setInputValue}
              onSend={handleSend}
              onDismissConfirm={dismissConfirm}
              commands={commands}
              onPickCommand={(cmd) => setInputValue(cmd)}
            />
            </>
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
              <Box sx={{ flex: 1, overflow: 'auto', p: 2, fontFamily: 'monospace', fontSize: '0.8rem' }}>
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
                  onClick={handleStart}
                  disabled={isRunning}
                >
                  Start
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<StopIcon />}
                  onClick={handleStop}
                  disabled={!isRunning}
                >
                  Stop
                </Button>
              </Stack>
            </Paper>
          )}

          {activeTab === 'git' && (
            <Box sx={{ height: '100%', overflow: 'auto', py: 1 }}>
              <GitPanel
                lastGit={lastGit}
                gitStatus={gitStatus}
                gitLoading={gitLoading}
                onRefreshGit={refreshGit}
                onUndo={handleUndo}
                isRunning={isRunning}
              />
            </Box>
          )}

          {activeTab === 'settings' && (
            <Container maxWidth="sm" disableGutters>
              <SettingsPanel
                config={config}
                apiPreview={apiPreview}
                sessionFiles={sessionFiles}
                onChange={setConfig}
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

export default App
