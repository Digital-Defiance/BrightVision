import NetworkPingIcon from '@mui/icons-material/NetworkPing'
import RefreshIcon from '@mui/icons-material/Refresh'
import StopIcon from '@mui/icons-material/Stop'
import Tooltip from '@mui/material/Tooltip'
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { DISPLAY_VISION_API } from '../../brand'
import { ChipAiStartIcon } from '../icons/ActionChipIcons'
import type { LocalLlmControls } from '../../hooks/useLocalLlmControls'

interface LocalLlmActionButtonsProps {
  controls: LocalLlmControls
  /** Show Unload model + Refresh (Terminal-style full row). */
  showSecondary?: boolean
  /** Show Start Local LLM (pull/preload) — hidden for external backends. */
  showPull?: boolean
}

export function LocalLlmActionButtons({
  controls,
  showSecondary = true,
  showPull = true,
}: LocalLlmActionButtonsProps) {
  const {
    busy,
    backendUnavailable,
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

  const disabled = busy || backendUnavailable

  return (
    <Stack spacing={1}>
      <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
        {showPull && (
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <ChipAiStartIcon />}
            disabled={disabled}
            data-testid="local-llm-start"
            onClick={() => void runStart()}
          >
            Start Local LLM
          </Button>
        )}
        <Tooltip
          title={`Checks Ollama (generate probe) and ${DISPLAY_VISION_API} /health. Does not start the API — use Settings → Start Vision API or Terminal → Start.`}
        >
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={<NetworkPingIcon />}
              disabled={disabled}
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
              disabled={disabled}
              data-testid="local-llm-stop"
              onClick={() => void runStop(true)}
            >
              Unload model
            </Button>
            <Button
              size="small"
              variant="text"
              startIcon={<RefreshIcon />}
              disabled={disabled}
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
