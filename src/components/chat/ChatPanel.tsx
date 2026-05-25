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
  Typography,
} from '@mui/material'
import { useEffect, useRef } from 'react'
import { DISPLAY_CORE } from '../../brand'
import type { VisionCommand } from '../../ipc/commands'
import type { CoreConfirmEvent } from '../../ipc/events'
import { parseFileCommandInput, replaceFileCommandPath } from '../../utils/fileCommandComplete'
import { ConfirmBanner } from '../ConfirmBanner'
import { AssistantMessageBody } from './AssistantMessageBody'
import { ChatFolderAttach } from './ChatFolderAttach'
import { ChatImageAttach } from './ChatImageAttach'
import { CommandAssist } from './CommandAssist'
import { TokenStatsBar } from './TokenStatsBar'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  /** Paths reported in the following `done` event for this turn. */
  appliedFiles?: string[]
}

export interface ToolEvent {
  id: number
  type: 'tool_call' | 'tool_result' | 'tool_warning'
  name?: string
  input?: string
  output?: string
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
  commands: VisionCommand[]
  onPickCommand: (command: string) => void
  useNativeImagePicker?: boolean
  onNativeAttachImages?: () => void
  onAttachFiles?: (files: FileList) => void
  onAttachTerminalTail?: () => void
  terminalTailAvailable?: boolean
  onAttachContextDirectory?: () => void
  onAttachFolderPath?: (relativePath: string) => void
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
  commands,
  onPickCommand,
  useNativeImagePicker,
  onNativeAttachImages,
  onAttachFiles,
  onAttachTerminalTail,
  terminalTailAvailable = false,
  onAttachContextDirectory,
  onAttachFolderPath,
}: ChatPanelProps) {
  const pathTabIndex = useRef(0)
  const pathPrefix = parseFileCommandInput(inputValue)?.pathPrefix ?? ''

  useEffect(() => {
    pathTabIndex.current = 0
  }, [pathPrefix, pathSuggestions.length])

  const meaningfulToolEvents = toolEvents.filter(
    (t) => t.type === 'tool_warning' || t.output?.trim() || t.type === 'tool_call'
  )

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', width: '100%' }}>
      {pendingConfirm && (
        <ConfirmBanner confirm={pendingConfirm} onAnswer={onConfirmAnswer} />
      )}
      {(isBusy || queuedCount > 0) && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, px: 1 }}>
          {isBusy ? 'Agent is working — use Stop to cancel the current turn.' : ''}
          {queuedCount > 0 && (
            <>
              {isBusy ? ' ' : ''}
              {queuedCount} message{queuedCount === 1 ? '' : 's'} queued.
            </>
          )}
        </Typography>
      )}
      <Box sx={{ flex: 1, overflow: 'auto', mb: 1, px: 1 }}>
        {messages.length === 0 && meaningfulToolEvents.length === 0 && (
          <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
            <Typography color="text.secondary">
              Start {DISPLAY_CORE} from the Terminal tab, then chat here.
            </Typography>
          </Paper>
        )}
        <Stack spacing={2}>
          {messages.map((msg) => (
            <Box
              key={msg.id}
              sx={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <Paper
                sx={{
                  position: 'relative',
                  px: 2,
                  py: 1.5,
                  maxWidth: msg.role === 'user' ? '85%' : '95%',
                  width: msg.role === 'assistant' ? '100%' : undefined,
                  bgcolor:
                    msg.role === 'user'
                      ? 'primary.dark'
                      : msg.role === 'system'
                        ? 'warning.dark'
                        : 'background.paper',
                  border: msg.role === 'assistant' ? 1 : 0,
                  borderColor: 'divider',
                }}
              >
                <IconButton
                  size="small"
                  aria-label="Dismiss message"
                  onClick={() => onDismissMessage(msg.id)}
                  sx={{ position: 'absolute', top: 4, right: 4, opacity: 0.6 }}
                >
                  <CloseIcon fontSize="inherit" />
                </IconButton>
                {msg.role === 'assistant' ? (
                  <AssistantMessageBody
                    content={msg.content}
                    appliedFiles={msg.appliedFiles}
                  />
                ) : (
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', pr: 3 }}>
                    {msg.content}
                  </Typography>
                )}
              </Paper>
            </Box>
          ))}

          {meaningfulToolEvents.map((tool) => (
            <Box key={tool.id} sx={{ width: '100%' }}>
              {tool.type === 'tool_warning' ? (
                <Alert severity="warning" sx={{ mb: 1 }}>
                  <Typography variant="body2" component="span">
                    {tool.output}
                  </Typography>
                </Alert>
              ) : (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    maxWidth: '95%',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    bgcolor: 'action.hover',
                  }}
                >
                  <Typography
                    variant="caption"
                    color="primary.main"
                    display="block"
                    gutterBottom
                    fontWeight="bold"
                  >
                    {tool.type === 'tool_call' ? 'Tool call' : 'Tool'}: {tool.name || 'tool'}
                  </Typography>
                  {(tool.input || tool.output) && (
                    <Typography
                      component="pre"
                      variant="body2"
                      sx={{ m: 0, whiteSpace: 'pre-wrap', overflowX: 'auto' }}
                    >
                      {tool.input || tool.output}
                    </Typography>
                  )}
                </Paper>
              )}
            </Box>
          ))}
        </Stack>
        <div ref={chatEndRef} />
      </Box>

      <TokenStatsBar stats={tokenStats} />

      <CommandAssist
        commands={commands}
        inputValue={inputValue}
        pathSuggestions={pathSuggestions}
        pathAssistActive={pathAssistActive}
        disabled={!isRunning}
        onPickCommand={onPickCommand}
        onPickPath={(path) => onInputChange(replaceFileCommandPath(inputValue, path))}
      />

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
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
            if (e.key === 'Tab') {
              if (pathAssistActive && pathSuggestions.length > 0) {
                e.preventDefault()
                const idx = pathTabIndex.current % pathSuggestions.length
                pathTabIndex.current = idx + 1
                onInputChange(replaceFileCommandPath(inputValue, pathSuggestions[idx]))
                return
              }
              if (inputValue.trim().startsWith('/')) {
                const token = inputValue.trim().split(/\s/)[0] ?? ''
                const match = commands.find((c) =>
                  c.name.toLowerCase().startsWith(token.toLowerCase())
                )
                if (match && match.name !== token) {
                  e.preventDefault()
                  onPickCommand(
                    match.name + (inputValue.includes(' ') ? inputValue.slice(token.length) : ' ')
                  )
                }
              }
            }
          }}
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
