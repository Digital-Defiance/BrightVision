import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import SpeedIcon from '@mui/icons-material/Speed'
import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material'
import type { ModelRouteSnapshot } from '../../ipc/modelRouterLlm'
import { formatModelRouteEvent } from '../../theme/modelRouterPrefs'

export interface RouterEscalateOffer {
  message: string
}

interface ModelRouterBarProps {
  enabled: boolean
  lastRoute: ModelRouteSnapshot | null
  escalateOffer: RouterEscalateOffer | null
  isRunning: boolean
  isBusy: boolean
  onEscalate: () => void
  onForceTier: (tier: 'fast' | 'heavy') => void
  onDismissEscalate?: () => void
}

export function ModelRouterBar({
  enabled,
  lastRoute,
  escalateOffer,
  isRunning,
  isBusy,
  onEscalate,
  onForceTier,
  onDismissEscalate,
}: ModelRouterBarProps) {
  if (!enabled) return null

  return (
    <Box sx={{ px: 1, pt: 0.5 }} data-testid="model-router-bar">
      <Stack direction="row" flexWrap="wrap" gap={0.75} alignItems="center" useFlexGap>
        {lastRoute && (
          <Chip
            size="small"
            variant="outlined"
            color={lastRoute.tier === 'fast' ? 'success' : 'warning'}
            label={formatModelRouteEvent(lastRoute)}
            data-testid="model-router-chip"
          />
        )}
        <Typography variant="caption" color="text.secondary">
          Force:
        </Typography>
        <Button
          size="small"
          variant="text"
          disabled={!isRunning || isBusy}
          startIcon={<SpeedIcon fontSize="small" />}
          onClick={() => onForceTier('fast')}
          data-testid="model-router-force-fast"
        >
          Fast
        </Button>
        <Button
          size="small"
          variant="text"
          disabled={!isRunning || isBusy}
          startIcon={<RocketLaunchIcon fontSize="small" />}
          onClick={() => onForceTier('heavy')}
          data-testid="model-router-force-heavy"
        >
          Heavy
        </Button>
      </Stack>
      {escalateOffer && (
        <Alert
          severity="info"
          sx={{ mt: 0.75, py: 0 }}
          onClose={onDismissEscalate}
          data-testid="model-router-escalate-offer"
        >
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            The fast model did not apply edits. Escalate the same prompt to your heavy model?
          </Typography>
          <Button
            size="small"
            variant="contained"
            disabled={!isRunning || isBusy}
            onClick={onEscalate}
            data-testid="model-router-escalate-btn"
          >
            Escalate to heavy
          </Button>
        </Alert>
      )}
    </Box>
  )
}
