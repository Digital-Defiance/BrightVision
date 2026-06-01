import NetworkPingIcon from '@mui/icons-material/NetworkPing'
import Tooltip from '@mui/material/Tooltip'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import RefreshIcon from '@mui/icons-material/Refresh'
import StopIcon from '@mui/icons-material/Stop'
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { DISPLAY_VISION_API } from '../../brand'
import type { LocalLlmControls } from '../../hooks/useLocalLlmControls'

interface LocalLlmActionButtonsProps {
  controls: LocalLlmControls
  /** Show Unload model + Refresh (Terminal-style full row). */
  showSecondary?: boolean
}

export function LocalLlmActionButtons({
  controls,
  showSecondary = true,
}: LocalLlmActionButtonsProps) {
  const {
    busy,
    pingResult,
    error,
    runStart,
    runPing,
    runStop,
    refresh,
    clearPingResult,
    clearError,
    formatLlmPingSummary,
    formatLlmPingHint,
    llmPingAlertSeverity,
  } = controls

  return (
    <Stack spacing={1}>
      <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
        <Button
          size="small"
          variant="contained"
          color="success"
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
          disabled={busy}
          data-testid="local-llm-start"
          onClick={() => void runStart()}
        >
          Start Local LLM
        </Button>
        <Tooltip
          title={`Checks Ollama (generate probe) and ${DISPLAY_VISION_API} /health. Does not start the API — use Settings → Start Vision API or Terminal → Start.`}
        >
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={<NetworkPingIcon />}
              disabled={busy}
              data-testid="local-llm-ping"
              onClick={() => void runPing()}
            >
              Ping stack
            </Button>
          </span>
        </Tooltip>
        {showSecondary && (
          <>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<StopIcon />}
              disabled={busy}
              data-testid="local-llm-stop"
              onClick={() => void runStop(true)}
            >
              Unload model
            </Button>
            <Button
              size="small"
              variant="text"
              startIcon={<RefreshIcon />}
              disabled={busy}
              onClick={() => void refresh()}
            >
              Refresh
            </Button>
          </>
        )}
      </Stack>
      {pingResult && (
        <Alert
          severity={llmPingAlertSeverity(pingResult)}
          data-testid="local-llm-ping-result"
          onClose={clearPingResult}
        >
          {formatLlmPingSummary(pingResult)}
          {formatLlmPingHint(pingResult) && (
            <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
              {formatLlmPingHint(pingResult)}
            </Typography>
          )}
          {pingResult.responsePreview && (
            <Typography
              component="span"
              variant="caption"
              display="block"
              sx={{ mt: 0.5, fontFamily: 'monospace' }}
            >
              Response: {pingResult.responsePreview}
            </Typography>
          )}
        </Alert>
      )}
      {error && (
        <Alert severity="error" onClose={clearError}>
          {error}
        </Alert>
      )}
    </Stack>
  )
}
