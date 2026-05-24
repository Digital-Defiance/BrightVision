import SendIcon from '@mui/icons-material/Send'
import { Box, Button, Container, Paper, Stack, TextField, Typography } from '@mui/material'
import { DISPLAY_CORE } from '../../brand'
import type { VisionCommand } from '../../ipc/commands'
import { ConfirmBanner } from '../ConfirmBanner'
import { CommandAssist } from './CommandAssist'
import type { CoreConfirmEvent } from '../../ipc/events'

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ToolEvent {
  id: number
  type: 'tool_call' | 'tool_result'
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
  pendingConfirm: CoreConfirmEvent | null
  chatEndRef: React.RefObject<HTMLDivElement>
  onInputChange: (value: string) => void
  onSend: () => void
  onDismissConfirm: () => void
  commands: VisionCommand[]
  onPickCommand: (command: string) => void
}

export function ChatPanel({
  messages,
  toolEvents,
  inputValue,
  isRunning,
  isBusy,
  pendingConfirm,
  chatEndRef,
  onInputChange,
  onSend,
  onDismissConfirm,
  commands,
  onPickCommand,
}: ChatPanelProps) {
  return (
    <Container maxWidth="md" disableGutters sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {pendingConfirm && <ConfirmBanner confirm={pendingConfirm} onDismiss={onDismissConfirm} />}
      {isBusy && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Agent is working — see the pulse bar above.
        </Typography>
      )}
      <Box sx={{ flex: 1, overflow: 'auto', mb: 2 }}>
        {messages.length === 0 && (
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
                  px: 2,
                  py: 1.5,
                  maxWidth: '85%',
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
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {msg.content}
                </Typography>
              </Paper>
            </Box>
          ))}
          {toolEvents.map((tool) => (
            <Paper
              key={tool.id}
              variant="outlined"
              sx={{ p: 2, maxWidth: '85%', fontFamily: 'monospace', fontSize: '0.8rem' }}
            >
              <Typography variant="caption" color="warning.light" display="block" gutterBottom>
                {tool.name || 'tool'}
              </Typography>
              <Typography component="pre" variant="body2" sx={{ m: 0, whiteSpace: 'pre-wrap' }}>
                {tool.output}
              </Typography>
            </Paper>
          ))}
        </Stack>
        <div ref={chatEndRef} />
      </Box>
      <CommandAssist
        commands={commands}
        inputValue={inputValue}
        disabled={!isRunning || isBusy}
        onPickCommand={onPickCommand}
      />
      <Stack direction="row" spacing={1}>
        <TextField
          fullWidth
          size="small"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
            if (e.key === 'Tab' && inputValue.trim().startsWith('/')) {
              const token = inputValue.trim().split(/\s/)[0] ?? ''
              const match = commands.find((c) => c.name.toLowerCase().startsWith(token.toLowerCase()))
              if (match && match.name !== token) {
                e.preventDefault()
                onPickCommand(match.name + (inputValue.includes(' ') ? inputValue.slice(token.length) : ' '))
              }
            }
          }}
          placeholder={isRunning ? `Message ${DISPLAY_CORE}...` : `Start ${DISPLAY_CORE} to chat...`}
          disabled={!isRunning || isBusy}
        />
        <Button
          variant="contained"
          endIcon={<SendIcon />}
          onClick={onSend}
          disabled={!isRunning || isBusy || !inputValue.trim()}
        >
          Send
        </Button>
      </Stack>
    </Container>
  )
}
