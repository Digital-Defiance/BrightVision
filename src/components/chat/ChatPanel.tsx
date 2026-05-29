import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import StopIcon from '@mui/icons-material/Stop'
import TerminalIcon from '@mui/icons-material/Terminal'
import {
  Alert,
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { useMemo } from 'react'
import { mergeChatTimeline } from '../../utils/chatStream'
import { DISPLAY_CORE } from '../../brand'
import type { VisionCommand } from '../../ipc/commands'
import type { CoreConfirmEvent } from '../../ipc/events'
import { useFileCommandKeyboard } from '../../hooks/useFileCommandKeyboard'
import { ConfirmBanner } from '../ConfirmBanner'
import { AssistantMessageBody } from './AssistantMessageBody'
import { ChatFolderAttach } from './ChatFolderAttach'
import { ChatImageAttach } from './ChatImageAttach'
import { CommandAssist } from './CommandAssist'
import { SuggestedFilesTray } from './SuggestedFilesTray'
import { EmptyLlmWarning } from './EmptyLlmWarning'
import { TokenStatsBar } from './TokenStatsBar'
import { OllamaStatusMessage } from './OllamaStatusMessage'
import type { VisionClientCommandId } from '../../ipc/visionClientCommands'
import type { OllamaModelsSnapshot } from '../../ipc/localLlm'
import type { TurnThinkingTiming } from '../../utils/thinkingTiming'
import type { ThinkingTimingPrefs } from '../../theme/thinkingTimingPrefs'
import type { SuggestedFilesPrefs } from '../../theme/suggestedFilesPrefs'
import { ModelRouterBar, type RouterEscalateOffer } from './ModelRouterBar'
import { ChatAgentBar } from './ChatAgentBar'
import { ChatEasyStart } from './ChatEasyStart'
import type { SubAgentInfo } from '../../ipc/agentCommands'
import type { ModelRouteSnapshot } from '../../ipc/modelRouterLlm'
import type { AssistantContentSegment } from '../../utils/proposedEdits'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  /** Paths reported in the following `done` event for this turn. */
  appliedFiles?: string[]
  /** Section + turn durations captured when the turn completes. */
  turnTiming?: TurnThinkingTiming
  /** Client `/ps`, `/tags`, `/models` — rendered as tables, not sent to core. */
  ollamaStatus?: {
    command: VisionClientCommandId
    snapshot: OllamaModelsSnapshot
  }
}

export interface ToolEvent {
  id: number
  type: 'tool_call' | 'tool_result' | 'tool_warning'
  name?: string
  input?: string
  output?: string
  /** Set when core reported an empty LLM body (UI copy may be rewritten). */
  emptyLlm?: boolean
}

interface ChatPanelProps {
  messages: ChatMessage[]
  toolEvents: ToolEvent[]
  inputValue: string
  isRunning: boolean
  isBusy: boolean
  queuedCount: number
  pendingConfirm: CoreConfirmEvent | null
  pathSuggestions: string[]
  pathAssistActive: boolean
  tokenStats: string | null
  chatEndRef: React.RefObject<HTMLDivElement>
  onInputChange: (value: string) => void
  onSend: () => void
  onCancelSend: () => void
  onConfirmAnswer: (accepted: boolean) => void
  onDismissMessage: (id: number) => void
  onDismissToolEvent: (id: number) => void
  onClearHistory?: () => void
  commands: VisionCommand[]
  onPickCommand: (command: string) => void
  useNativeImagePicker?: boolean
  onNativeAttachImages?: () => void
  onAttachFiles?: (files: FileList) => void
  onAttachTerminalTail?: () => void
  terminalTailAvailable?: boolean
  onAttachContextDirectory?: () => void
  onAttachFolderPath?: (relativePath: string) => void
  suggestedFilePaths?: string[]
  suggestedAwaitingProceed?: boolean
  suggestedFilesPrefs?: SuggestedFilesPrefs
  onSuggestedFilesPrefsChange?: (prefs: SuggestedFilesPrefs) => void
  onSuggestedAddOne?: (path: string) => void
  onSuggestedAddAll?: () => void
  onSuggestedAddAllAndProceed?: () => void
  onSuggestedQueueAdds?: () => void
  onSuggestedDismiss?: (path: string) => void
  onSuggestedClearAll?: () => void
  thinkingTimingPrefs?: ThinkingTimingPrefs
  turnActivityHint?: string
  turnStalled?: boolean
  lastUserMessageForRetry?: string | null
  onRetryEmptyLlm?: (mode: 'exact' | 'nudge') => void
  onOpenInEditor?: (path: string) => void
  canApplyEdits?: boolean
  onApplyProposedEdit?: (
    messageId: number,
    segment: Extract<AssistantContentSegment, { type: 'proposed_edit' }>
  ) => Promise<void>
  modelRouterEnabled?: boolean
  lastModelRoute?: ModelRouteSnapshot | null
  routerEscalateOffer?: RouterEscalateOffer | null
  onEscalateRouter?: () => void
  onForceRouterTier?: (tier: 'fast' | 'heavy') => void
  onDismissRouterEscalate?: () => void
  subagents?: SubAgentInfo[]
  agentModeAvailable?: boolean
  /** When set and chat is empty, show in-tab Start instead of Terminal redirect copy. */
  easyStart?: {
    onStart: () => void
    starting: boolean
    startLabel?: string
    startDetail?: string
    disabled?: boolean
    disabledReason?: string
    showLocalLlmStep?: boolean
  }
  /** Hide generic empty copy when Welcome panel is shown above. */
  suppressEmptyHint?: boolean
}

export function ChatPanel({
  messages,
  toolEvents,
  inputValue,
  isRunning,
  isBusy,
  queuedCount,
  pendingConfirm,
  pathSuggestions,
  pathAssistActive,
  tokenStats,
  chatEndRef,
  onInputChange,
  onSend,
  onCancelSend,
  onConfirmAnswer,
  onDismissMessage,
  onDismissToolEvent,
  onClearHistory,
  commands,
  onPickCommand,
  useNativeImagePicker,
  onNativeAttachImages,
  onAttachFiles,
  onAttachTerminalTail,
  terminalTailAvailable = false,
  onAttachContextDirectory,
  onAttachFolderPath,
  suggestedFilePaths = [],
  suggestedAwaitingProceed = false,
  suggestedFilesPrefs,
  onSuggestedFilesPrefsChange,
  onSuggestedAddOne,
  onSuggestedAddAll,
  onSuggestedAddAllAndProceed,
  onSuggestedQueueAdds,
  onSuggestedDismiss,
  onSuggestedClearAll,
  thinkingTimingPrefs,
  turnActivityHint = '',
  turnStalled = false,
  lastUserMessageForRetry = null,
  onRetryEmptyLlm,
  onOpenInEditor,
  canApplyEdits = false,
  onApplyProposedEdit,
  modelRouterEnabled = false,
  lastModelRoute = null,
  routerEscalateOffer = null,
  onEscalateRouter,
  onForceRouterTier,
  onDismissRouterEscalate,
  subagents = [],
  agentModeAvailable = false,
  easyStart,
  suppressEmptyHint = false,
}: ChatPanelProps) {
  const { onKeyDown: onFileCommandKeyDown, onPickPath } = useFileCommandKeyboard({
    inputValue,
    pathSuggestions,
    pathAssistActive,
    commands,
    onInputChange,
    onPickCommand,
    onSend,
  })

  const meaningfulToolEvents = toolEvents.filter(
    (t) => t.type === 'tool_warning' || t.output?.trim() || t.type === 'tool_call'
  )

  const timeline = useMemo(
    () => mergeChatTimeline(messages, meaningfulToolEvents),
    [messages, meaningfulToolEvents]
  )

  const canClearHistory =
    Boolean(onClearHistory) && (messages.length > 0 || meaningfulToolEvents.length > 0)

  return (
    <Box
      className="vision-chat"
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', width: '100%' }}
    >
      {pendingConfirm && (
        <ConfirmBanner confirm={pendingConfirm} onAnswer={onConfirmAnswer} />
      )}
      {(isBusy || queuedCount > 0) && turnActivityHint && (
        <Alert
          severity={turnStalled ? 'warning' : 'info'}
          variant="outlined"
          sx={{ mb: 1, mx: 1, py: 0.25 }}
          data-testid="turn-activity-hint"
        >
          <Typography variant="caption" component="span">
            {turnActivityHint}
          </Typography>
        </Alert>
      )}
      <Box sx={{ flex: 1, overflow: 'auto', mb: 1, px: 1, minHeight: 0 }}>
        {messages.length === 0 && meaningfulToolEvents.length === 0 && easyStart && (
          <ChatEasyStart
            onStart={easyStart.onStart}
            starting={easyStart.starting}
            startLabel={easyStart.startLabel}
            startDetail={easyStart.startDetail}
            disabled={easyStart.disabled}
            disabledReason={easyStart.disabledReason}
            showLocalLlmStep={easyStart.showLocalLlmStep}
          />
        )}
        {messages.length === 0 &&
          meaningfulToolEvents.length === 0 &&
          !easyStart &&
          !suppressEmptyHint &&
          !isRunning && (
            <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">
                Start {DISPLAY_CORE} to begin chatting.
              </Typography>
            </Paper>
          )}
        <Stack spacing={2}>
          {timeline.map((entry) =>
            entry.kind === 'message' ? (
              <Box
                key={`msg-${entry.item.id}`}
                sx={{
                  display: 'flex',
                  justifyContent: entry.item.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <Paper
                  data-testid={
                    entry.item.role === 'user'
                      ? 'chat-message-user'
                      : entry.item.role === 'assistant'
                        ? 'chat-message-assistant'
                        : 'chat-message-system'
                  }
                  sx={{
                    position: 'relative',
                    px: 2,
                    py: 1.5,
                    maxWidth: entry.item.role === 'user' ? '85%' : '95%',
                    width: entry.item.role === 'assistant' ? '100%' : undefined,
                    bgcolor:
                      entry.item.role === 'user'
                        ? 'primary.dark'
                        : entry.item.role === 'system'
                          ? 'warning.dark'
                          : 'background.paper',
                    border: entry.item.role === 'assistant' ? 1 : 0,
                    borderColor: 'divider',
                  }}
                >
                  <IconButton
                    size="small"
                    aria-label="Dismiss message"
                    onClick={() => onDismissMessage(entry.item.id)}
                    sx={{ position: 'absolute', top: 4, right: 4, opacity: 0.6 }}
                  >
                    <CloseIcon fontSize="inherit" />
                  </IconButton>
                  {entry.item.role === 'assistant' && entry.item.ollamaStatus ? (
                    <OllamaStatusMessage
                      command={entry.item.ollamaStatus.command}
                      snapshot={entry.item.ollamaStatus.snapshot}
                    />
                  ) : entry.item.role === 'assistant' ? (
                    <AssistantMessageBody
                      content={entry.item.content}
                      appliedFiles={entry.item.appliedFiles}
                      onOpenInEditor={onOpenInEditor}
                      canApplyEdits={canApplyEdits}
                      onApplyProposedEdit={
                        onApplyProposedEdit
                          ? (segment) => onApplyProposedEdit(entry.item.id, segment)
                          : undefined
                      }
                      turnTiming={entry.item.turnTiming}
                      showSectionDurations={thinkingTimingPrefs?.showSectionDurations ?? true}
                      showTurnTotal={thinkingTimingPrefs?.showMessageTurnTotal ?? true}
                    />
                  ) : (
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', pr: 3 }}>
                      {entry.item.content}
                    </Typography>
                  )}
                </Paper>
              </Box>
            ) : (
              <Box key={`tool-${entry.item.id}`} sx={{ width: '100%' }}>
                {entry.item.type === 'tool_warning' ? (
                  entry.item.emptyLlm && onRetryEmptyLlm ? (
                    <EmptyLlmWarning
                      message={entry.item.output ?? ''}
                      lastUserMessage={lastUserMessageForRetry}
                      disabled={!isRunning}
                      onRetry={onRetryEmptyLlm}
                      onDismiss={() => onDismissToolEvent(entry.item.id)}
                    />
                  ) : (
                    <Alert
                      severity="warning"
                      sx={{ mb: 1 }}
                      data-testid="chat-tool-warning"
                      onClose={() => onDismissToolEvent(entry.item.id)}
                    >
                      <Typography variant="body2" component="span">
                        {entry.item.output}
                      </Typography>
                    </Alert>
                  )
                ) : (
                  <Paper
                    data-testid="chat-tool-output"
                    variant="outlined"
                    sx={{
                      position: 'relative',
                      p: 2,
                      maxWidth: '95%',
                      bgcolor: 'action.hover',
                    }}
                  >
                    <IconButton
                      size="small"
                      aria-label="Dismiss tool output"
                      onClick={() => onDismissToolEvent(entry.item.id)}
                      sx={{ position: 'absolute', top: 4, right: 4, opacity: 0.6 }}
                    >
                      <CloseIcon fontSize="inherit" />
                    </IconButton>
                    <Typography
                      variant="caption"
                      color="primary.main"
                      display="block"
                      gutterBottom
                      fontWeight="bold"
                      sx={{ pr: 3 }}
                    >
                      {entry.item.type === 'tool_call' ? 'Tool call' : 'Tool'}:{' '}
                      {entry.item.name || 'tool'}
                    </Typography>
                    {(entry.item.input || entry.item.output) && (
                      <Typography
                        component="pre"
                        variant="body2"
                        sx={{ m: 0, pr: 3, whiteSpace: 'pre-wrap', overflowX: 'auto' }}
                      >
                        {entry.item.input || entry.item.output}
                      </Typography>
                    )}
                  </Paper>
                )}
              </Box>
            )
          )}
        </Stack>
        {onClearHistory && (
          <Box
            sx={{
              position: 'sticky',
              bottom: 0,
              zIndex: 1,
              display: 'flex',
              justifyContent: 'flex-end',
              pt: 0.5,
              pb: 0.25,
              mt: -0.5,
              pointerEvents: 'none',
              '& > *': { pointerEvents: 'auto' },
            }}
          >
            <Tooltip title="Clear chat history">
              <span>
                <IconButton
                  size="small"
                  aria-label="Clear chat history"
                  data-testid="chat-clear-history"
                  disabled={!canClearHistory || isBusy}
                  onClick={onClearHistory}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: 1,
                    border: 1,
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    opacity: canClearHistory ? 0.75 : 0.35,
                    '&:hover':
                      canClearHistory ? { opacity: 1, bgcolor: 'action.hover' } : undefined,
                  }}
                >
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        )}
        <div ref={chatEndRef} />
      </Box>

      <TokenStatsBar stats={tokenStats} />

      {onSuggestedAddOne &&
        onSuggestedAddAll &&
        onSuggestedQueueAdds &&
        onSuggestedDismiss &&
        onSuggestedClearAll && (
          <SuggestedFilesTray
            paths={suggestedFilePaths}
            disabled={!isRunning}
            isBusy={isBusy}
            awaitingProceed={suggestedAwaitingProceed}
            prefs={suggestedFilesPrefs}
            onPrefsChange={onSuggestedFilesPrefsChange}
            onAddOne={onSuggestedAddOne}
            onAddAll={onSuggestedAddAll}
            onAddAllAndProceed={onSuggestedAddAllAndProceed}
            onQueueAdds={onSuggestedQueueAdds}
            onDismiss={onSuggestedDismiss}
            onClearAll={onSuggestedClearAll}
            onOpenInEditor={onOpenInEditor}
          />
        )}

      <ChatAgentBar
        subagents={subagents}
        agentModeAvailable={agentModeAvailable}
        disabled={!isRunning}
        onPickCommand={onPickCommand}
      />

      <CommandAssist
        commands={commands}
        inputValue={inputValue}
        pathSuggestions={pathSuggestions}
        pathAssistActive={pathAssistActive}
        disabled={!isRunning}
        onPickCommand={onPickCommand}
        onPickPath={onPickPath}
      />

      {modelRouterEnabled && onForceRouterTier && onEscalateRouter && (
        <ModelRouterBar
          enabled={modelRouterEnabled}
          lastRoute={lastModelRoute}
          escalateOffer={routerEscalateOffer}
          isRunning={isRunning}
          isBusy={isBusy}
          onEscalate={onEscalateRouter}
          onForceTier={onForceRouterTier}
          onDismissEscalate={onDismissRouterEscalate}
        />
      )}

      <Stack direction="row" spacing={1} sx={{ p: 1 }} alignItems="flex-end">
        {onAttachFiles && (
          <ChatImageAttach
            disabled={!isRunning}
            useNativePicker={useNativeImagePicker}
            onNativePick={onNativeAttachImages}
            onPickFiles={onAttachFiles}
          />
        )}
        {onAttachTerminalTail && (
          <IconButton
            size="small"
            aria-label="Attach last terminal output to message"
            title="Attach terminal output"
            disabled={!isRunning || !terminalTailAvailable}
            onClick={onAttachTerminalTail}
          >
            <TerminalIcon fontSize="small" />
          </IconButton>
        )}
        {(onAttachContextDirectory || onAttachFolderPath) && (
          <ChatFolderAttach
            disabled={!isRunning}
            useNativePicker={Boolean(onAttachContextDirectory)}
            onNativePick={onAttachContextDirectory}
            onAddFolderPath={onAttachFolderPath}
          />
        )}
        <TextField
          fullWidth
          size="small"
          multiline
          maxRows={6}
          inputProps={{ 'data-testid': 'chat-input' }}
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onFileCommandKeyDown}
          placeholder={
            isRunning
              ? isBusy
                ? `Queue a follow-up for ${DISPLAY_CORE}...`
                : `Message ${DISPLAY_CORE}...`
              : `Start ${DISPLAY_CORE} to chat...`
          }
          disabled={!isRunning}
        />
        {isBusy ? (
          <Stack direction="row" spacing={0.5} sx={{ alignSelf: 'flex-end' }}>
            <Button
              data-testid="chat-queue"
              variant="contained"
              endIcon={<SendIcon />}
              onClick={onSend}
              disabled={!isRunning || !inputValue.trim()}
            >
              Queue
            </Button>
            <Button
              data-testid="chat-stop-turn"
              variant="outlined"
              color="warning"
              startIcon={<StopIcon />}
              onClick={onCancelSend}
            >
              Stop
            </Button>
          </Stack>
        ) : (
          <Button
            data-testid="chat-send"
            variant="contained"
            endIcon={<SendIcon />}
            onClick={onSend}
            disabled={!isRunning || !inputValue.trim()}
            sx={{ alignSelf: 'flex-end' }}
          >
            Send
          </Button>
        )}
      </Stack>
    </Box>
  )
}
