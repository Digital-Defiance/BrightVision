import ApiIcon from '@mui/icons-material/Api'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import RefreshIcon from '@mui/icons-material/Refresh'
import StopIcon from '@mui/icons-material/Stop'
import Tooltip from '@mui/material/Tooltip'
import { Alert, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material'
import { DISPLAY_VISION_API } from '../../brand'
import type { VisionApiControls } from '../../hooks/useVisionApiControls'

interface VisionApiActionButtonsProps {
  controls: VisionApiControls
  sessionActive?: boolean
}

export function VisionApiActionButtons({
  controls,
  sessionActive = false,
}: VisionApiActionButtonsProps) {
  const { busy, error, apiReachable, runStart, runStop, probe, clearError } = controls

  return (
    <Stack spacing={1}>
      <Stack direction="row" flexWrap="wrap" gap={1} alignItems="center">
        <Button
          size="small"
          variant="contained"
          color="primary"
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <PlayArrowIcon />}
          disabled={busy}
          data-testid="vision-api-start"
          onClick={() => void runStart()}
        >
          Start {DISPLAY_VISION_API}
        </Button>
        <Tooltip
          title={
            sessionActive
              ? 'Stop the session from Terminal first — that tears down the API safely.'
              : `Stop ${DISPLAY_VISION_API} on :8741`
          }
        >
          <span>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<StopIcon />}
              disabled={busy || sessionActive}
              data-testid="vision-api-stop"
              onClick={() => void runStop()}
            >
              Stop {DISPLAY_VISION_API}
            </Button>
          </span>
        </Tooltip>
        <Button
          size="small"
          variant="text"
          startIcon={<RefreshIcon />}
          disabled={busy}
          onClick={() => void probe()}
        >
          Refresh
        </Button>
        <Chip
          size="small"
          icon={<ApiIcon sx={{ fontSize: '1rem !important' }} />}
          label={
            apiReachable === null
              ? 'Checking…'
              : apiReachable
                ? `${DISPLAY_VISION_API} up`
                : `${DISPLAY_VISION_API} down`
          }
          color={apiReachable ? 'success' : 'default'}
          variant={apiReachable ? 'filled' : 'outlined'}
        />
      </Stack>
      {sessionActive && (
        <Typography variant="caption" color="text.secondary">
          Session is active — {DISPLAY_VISION_API} is managed by Terminal → Stop.
        </Typography>
      )}
      {error && (
        <Alert severity="error" onClose={clearError}>
          {error}
        </Alert>
      )}
    </Stack>
  )
}
