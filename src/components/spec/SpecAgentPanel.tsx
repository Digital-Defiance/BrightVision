import ArticleIcon from '@mui/icons-material/Article'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import HubIcon from '@mui/icons-material/Hub'
import SendIcon from '@mui/icons-material/Send'
import StopIcon from '@mui/icons-material/Stop'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useRef } from 'react'
import type { VisionCommand } from '../../ipc/commands'
import { useFileCommandKeyboard } from '../../hooks/useFileCommandKeyboard'
import type { ChatMessage } from '../chat/ChatPanel'
import { AssistantMessageBody } from '../chat/AssistantMessageBody'
import { ChatFolderAttach } from '../chat/ChatFolderAttach'
import { CommandAssist } from '../chat/CommandAssist'
import type { TodoItem } from '../../todos/types'
import type { SpecTraceHint } from '../../utils/specTraceHint'
import {
  resolveSpecGeneratePrompt,
  truncatePromptPreview,
} from '../../utils/specGeneratePrompt'
import { SessionContextChip } from '../session/SessionContextChip'
import type { SessionContextUsage } from '../../utils/contextUsage'
import { isTauriRuntime } from '../../ipc/isTauri'
import {
  SessionModeToggle,
  type SessionMode,
} from '../session/SessionModeToggle'

export interface SpecAgentPanelProps {
  messages: ChatMessage[]
  inputValue: string
  isRunning: boolean
  isBusy: boolean
  sessionReady: boolean
  activeTodo: TodoItem | null
  specGenerating?: boolean
  earsLinting?: boolean
  specTracing?: boolean
  chatEndRef: React.RefObject<HTMLDivElement>
  onInputChange: (value: string) => void
  onSend: () => void
  onCancelSend: () => void
  onOpenTasks: () => void
  sessionMode: SessionMode
  liveSessionMode?: SessionMode | null
  sessionRunning?: boolean
  onSessionModeChange: (mode: SessionMode) => void
  specJobPrompt?: string | null
  commands: VisionCommand[]
  pathSuggestions: string[]
  pathAssistActive: boolean
  onPickCommand: (command: string) => void
  onGenerateSpec?: (prompt: string) => void
  onRefineSpec?: (prompt: string) => void
  onValidateEars?: () => void
  onTraceSpec?: () => void
  onClearHistory?: () => void
  traceHint?: SpecTraceHint | null
  onRefineWithHint?: () => void
  onDismissTraceHint?: () => void
  contextFiles?: string[]
  contextUsage?: SessionContextUsage
  onOpenContextInEditor?: (path: string) => void
  onAttachContextDirectory?: () => void
  onAttachFolderPath?: (path: string) => void
}

export function SpecAgentPanel({
  messages,
  inputValue,
  isRunning,
  isBusy,
  sessionReady,
  activeTodo,
  specGenerating,
  earsLinting,
  specTracing,
  chatEndRef,
  onInputChange,
  onSend,
  onCancelSend,
  onOpenTasks,
  sessionMode,
  liveSessionMode = null,
  sessionRunning = false,
  onSessionModeChange,
  specJobPrompt = null,
  commands,
  pathSuggestions,
  pathAssistActive,
  onPickCommand,
  onGenerateSpec,
  onRefineSpec,
  onValidateEars,
  onTraceSpec,
  onClearHistory,
  traceHint,
  onRefineWithHint,
  onDismissTraceHint,
  contextFiles = [],
  contextUsage,
  onOpenContextInEditor,
  onAttachContextDirectory,
  onAttachFolderPath,
}: SpecAgentPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { onKeyDown, onPickPath } = useFileCommandKeyboard({
    inputValue,
    pathSuggestions,
    pathAssistActive,
    commands,
    onInputChange,
    onPickCommand,
    onSend,
  })
  const generatePrompt = activeTodo
    ? resolveSpecGeneratePrompt(inputValue, activeTodo.title, 'generate')
    : ''
  const refinePrompt = activeTodo
    ? resolveSpecGeneratePrompt(inputValue, activeTodo.title, 'refine')
    : ''
  const usingDraftForGenerate = Boolean(inputValue.trim())
  const usingDraftForRefine = Boolean(inputValue.trim())
  const pathCompleteHint = isTauriRuntime()
    ? 'Tab completes paths'
    : 'Path Tab completion on desktop app only'

  return (
    <Box
      data-testid="spec-agent-panel"
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 1, gap: 1 }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <ArticleIcon color="primary" fontSize="small" />
          <Typography variant="subtitle1" fontWeight={600}>
            Spec agent
          </Typography>
          <SessionModeToggle
            value={sessionMode}
            onChange={onSessionModeChange}
            liveMode={liveSessionMode}
            sessionRunning={sessionRunning}
            size="small"
          />
          {activeTodo ? (
            <Chip size="small" label={activeTodo.title} data-testid="spec-agent-active-task" />
          ) : (
            <Chip size="small" color="warning" label="No active task" />
          )}
          {contextUsage && (
            <SessionContextChip
              files={contextFiles}
              usage={contextUsage}
              onOpenInEditor={onOpenContextInEditor}
            />
          )}
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button size="small" onClick={onOpenTasks}>
            Tasks
          </Button>
          {onClearHistory && messages.length > 0 && (
            <Button size="small" onClick={onClearHistory}>
              Clear
            </Button>
          )}
        </Stack>
      </Stack>

      <Alert severity="info" sx={{ py: 0.5 }}>
        {sessionMode === 'spec'
          ? 'Spec session: steering + active task spec on each turn. Terminal → Start after setting an active task.'
          : 'Vibe session: use Chat for implementation. Switch to Spec mode before Start for spec-first work.'}
        {' '}Layer edits on Tasks. Attach files with <strong>/add path</strong> in the prompt below (Enter).
      </Alert>

      {!activeTodo && (
        <Alert severity="warning">
          Set an <strong>active task</strong> on the Tasks tab before using the spec agent.
        </Alert>
      )}

      {traceHint && activeTodo && (
        <Alert
          severity={traceHint.errorCount > 0 ? 'warning' : 'info'}
          data-testid="spec-agent-trace-hint"
          onClose={onDismissTraceHint}
        >
          <Typography variant="body2" component="div" sx={{ mb: 1 }}>
            {traceHint.summary} — use <strong>Refine to fix</strong> or edit layers on Tasks.
          </Typography>
          {onRefineWithHint && (
            <Button
              size="small"
              variant="outlined"
              onClick={onRefineWithHint}
              disabled={!sessionReady || specGenerating}
              data-testid="spec-agent-refine-hint"
            >
              Refine to fix
            </Button>
          )}
        </Alert>
      )}

      {(specGenerating && specJobPrompt) || (sessionReady && activeTodo) ? (
        <Typography
          variant="caption"
          color="text.secondary"
          data-testid="spec-job-prompt-preview"
          sx={{ display: 'block' }}
        >
          {specGenerating && specJobPrompt ? (
            <>
              <strong>Running:</strong> {truncatePromptPreview(specJobPrompt, 120)}
            </>
          ) : (
            <>
              <strong>Generate</strong> → {truncatePromptPreview(generatePrompt)}
              {!usingDraftForGenerate ? ' (default — type above to override)' : ''}
              {' · '}
              <strong>Refine</strong> → {truncatePromptPreview(refinePrompt)}
              {!usingDraftForRefine ? ' (default)' : ''}
            </>
          )}
        </Typography>
      ) : null}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {onGenerateSpec && (
          <Button
            size="small"
            startIcon={specGenerating ? <CircularProgress size={14} /> : <AutoAwesomeIcon />}
            disabled={!sessionReady || !activeTodo || specGenerating}
            onClick={() => onGenerateSpec(generatePrompt)}
            data-testid="spec-agent-generate"
            title={generatePrompt}
          >
            Generate
          </Button>
        )}
        {onRefineSpec && (
          <Button
            size="small"
            disabled={!sessionReady || !activeTodo || specGenerating}
            onClick={() => onRefineSpec(refinePrompt)}
            data-testid="spec-agent-refine"
            title={refinePrompt}
          >
            Refine
          </Button>
        )}
        {onValidateEars && (
          <Button
            size="small"
            startIcon={earsLinting ? <CircularProgress size={14} /> : <FactCheckIcon />}
            disabled={!sessionReady || !activeTodo || earsLinting}
            onClick={onValidateEars}
            data-testid="spec-agent-validate-ears"
          >
            Validate EARS
          </Button>
        )}
        {onTraceSpec && (
          <Button
            size="small"
            startIcon={specTracing ? <CircularProgress size={14} /> : <HubIcon />}
            disabled={!sessionReady || !activeTodo || specTracing}
            onClick={onTraceSpec}
            data-testid="spec-agent-trace"
          >
            Trace
          </Button>
        )}
      </Stack>

      <Paper
        variant="outlined"
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          p: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        {messages.length === 0 && (
          <Typography variant="body2" color="text.secondary" data-testid="spec-agent-empty">
            <strong>Send</strong> — spec chat. <strong>/add path</strong> + Enter attaches files for
            Generate/Refine ({pathCompleteHint}). <strong>Generate / Refine</strong> use the prompt box below.
          </Typography>
        )}
        {messages.map((m) => (
          <Box
            key={m.id}
            data-testid={m.role === 'user' ? 'spec-agent-user' : 'spec-agent-assistant'}
            sx={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '92%',
            }}
          >
            {m.role === 'user' ? (
              <Paper sx={{ px: 1.5, py: 1, bgcolor: 'primary.dark' }}>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {m.content}
                </Typography>
              </Paper>
            ) : (
              <AssistantMessageBody content={m.content} />
            )}
          </Box>
        ))}
        <div ref={chatEndRef} />
      </Paper>

      <CommandAssist
        commands={commands}
        inputValue={inputValue}
        pathSuggestions={pathSuggestions}
        pathAssistActive={pathAssistActive}
        disabled={!isRunning || !activeTodo}
        onPickCommand={onPickCommand}
        onPickPath={onPickPath}
      />

      <Stack direction="row" spacing={1} alignItems="flex-end">
        {(onAttachContextDirectory || onAttachFolderPath) && (
          <ChatFolderAttach
            disabled={!isRunning || !activeTodo}
            useNativePicker={Boolean(onAttachContextDirectory)}
            onNativePick={onAttachContextDirectory}
            onAddFolderPath={onAttachFolderPath}
          />
        )}
        <TextField
          inputRef={inputRef}
          fullWidth
          label="Prompt / spec chat"
          inputProps={{ 'data-testid': 'spec-agent-input' }}
          multiline
          minRows={2}
          maxRows={6}
          size="small"
          helperText={`/add path + Enter attaches files (${pathCompleteHint}). Send = spec chat. Generate & Refine use this text when non-empty.`}
          placeholder={
            activeTodo
              ? '/add src/… then Enter · or ask a spec question and Send'
              : 'Select an active task first'
          }
          value={inputValue}
          disabled={!isRunning || !activeTodo}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {isBusy ? (
          <IconButton color="error" onClick={onCancelSend} aria-label="Stop" data-testid="spec-agent-stop">
            <StopIcon />
          </IconButton>
        ) : (
          <IconButton
            color="primary"
            onClick={onSend}
            disabled={!isRunning || !activeTodo || !inputValue.trim()}
            aria-label="Send"
            data-testid="spec-agent-send"
          >
            <SendIcon />
          </IconButton>
        )}
      </Stack>
    </Box>
  )
}
