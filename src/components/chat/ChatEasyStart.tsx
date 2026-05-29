import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import {
  Box,
  Button,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { DISPLAY_CORE, DISPLAY_VISION_API } from '../../brand'
import { isOllamaVisionModel } from '../../ipc/localLlm'

export interface ChatEasyStartProps {
  onStart: () => void
  starting: boolean
  startLabel?: string
  startDetail?: string
  disabled?: boolean
  disabledReason?: string
  /** Settings LLM model (shown so cloud vs local is obvious before Start). */
  llmModel?: string
  /** Desktop: show Ollama step when local LLM management is on. */
  showLocalLlmStep?: boolean
}

export function ChatEasyStart({
  onStart,
  starting,
  startLabel,
  startDetail,
  disabled = false,
  disabledReason,
  llmModel = '',
  showLocalLlmStep = false,
}: ChatEasyStartProps) {
  const model = llmModel.trim()
  const local = model ? isOllamaVisionModel(model) : showLocalLlmStep
  const steps = [
    model
      ? local
        ? `Ollama · ${model}`
        : `Cloud · ${model}`
      : showLocalLlmStep
        ? 'Local LLM (Ollama)'
        : 'Cloud LLM',
    `${DISPLAY_VISION_API} on :8741`,
    `${DISPLAY_CORE} coding session`,
  ]

  return (
    <Paper
      variant="outlined"
      data-testid="chat-easy-start"
      sx={{
        p: 3,
        textAlign: 'center',
        borderColor: 'divider',
        background:
          'linear-gradient(145deg, rgba(139, 92, 246, 0.06) 0%, rgba(34, 211, 238, 0.03) 100%)',
      }}
    >
      <Typography variant="subtitle1" fontWeight={700} gutterBottom>
        Ready to work
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        One click starts everything you need to chat — no Terminal tab required.
      </Typography>
      <Stack
        direction="row"
        spacing={1}
        justifyContent="center"
        flexWrap="wrap"
        useFlexGap
        sx={{ mb: 2 }}
      >
        {steps.map((label) => (
          <Box
            key={label}
            component="span"
            sx={{
              px: 1.25,
              py: 0.5,
              borderRadius: 1,
              bgcolor: 'action.hover',
              fontSize: '0.75rem',
              color: 'text.secondary',
            }}
          >
            {label}
          </Box>
        ))}
      </Stack>
      {starting && (
        <Box sx={{ mb: 2, textAlign: 'left' }}>
          <LinearProgress sx={{ mb: 1 }} />
          <Typography variant="caption" color="text.secondary" display="block">
            {startLabel ?? 'Starting…'}
            {startDetail ? ` — ${startDetail}` : ''}
          </Typography>
        </Box>
      )}
      {disabledReason && (
        <Typography variant="caption" color="warning.main" display="block" sx={{ mb: 1 }}>
          {disabledReason}
        </Typography>
      )}
      <Button
        variant="contained"
        color="success"
        size="large"
        startIcon={<PlayArrowIcon />}
        data-testid="chat-start-session"
        onClick={onStart}
        disabled={disabled || starting}
      >
        {starting ? 'Starting…' : 'Start'}
      </Button>
    </Paper>
  )
}
