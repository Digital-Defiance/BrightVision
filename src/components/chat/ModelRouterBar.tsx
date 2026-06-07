import PsychologyIcon from '@mui/icons-material/Psychology'
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch'
import SpeedIcon from '@mui/icons-material/Speed'
import { Alert, Box, Button, Stack, Typography } from '@mui/material'

export interface RouterEscalateOffer {
  message: string
  target?: 'code' | 'think'
}

interface ModelRouterBarProps {
  enabled: boolean
  escalateOffer: RouterEscalateOffer | null
  isRunning: boolean
  isBusy: boolean
  onEscalate: () => void
  onForceTier: (tier: 'fast' | 'code' | 'think') => void
  onDismissEscalate?: () => void
}

export function ModelRouterBar({
  enabled,
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
        <Typography variant="caption" color="text.secondary">
          Force tier:
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
          onClick={() => onForceTier('code')}
          data-testid="model-router-force-code"
        >
          Code
        </Button>
        <Button
          size="small"
          variant="text"
          disabled={!isRunning || isBusy}
          startIcon={<PsychologyIcon fontSize="small" />}
          onClick={() => onForceTier('think')}
          data-testid="model-router-force-think"
        >
          Think
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
          Chat reply edge = tier color · hover for model
        </Typography>
      </Stack>
      {escalateOffer && (
        <Alert
          severity="info"
          sx={{ mt: 0.75, py: 0 }}
          onClose={onDismissEscalate}
          data-testid="model-router-escalate-offer"
        >
          <Typography variant="body2" sx={{ mb: 0.5 }}>
            {escalateOffer.target === 'think'
              ? 'The code model did not finish the reasoning step. Escalate to your think model?'
              : 'The fast model did not apply edits. Escalate the same prompt to your code model?'}
          </Typography>
          <Button
            size="small"
            variant="contained"
            disabled={!isRunning || isBusy}
            onClick={onEscalate}
            data-testid="model-router-escalate-btn"
          >
            {escalateOffer.target === 'think' ? 'Escalate to think' : 'Escalate to code'}
          </Button>
        </Alert>
      )}
    </Box>
  )
}
