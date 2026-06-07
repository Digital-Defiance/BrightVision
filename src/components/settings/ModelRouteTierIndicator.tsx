import { Box, Stack, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import type { Theme } from '@mui/material/styles'
import { hopperTierLabel, normalizeHopperTier, type ModelHopperTier } from '../../theme/modelHopper'
import { normalizeModelRouteRole, type ModelRouteRole } from '../../theme/modelRouterPrefs'
import { modelRouteAccentColor, modelRouteRoleLabel } from '../../theme/modelRouteUi'

export function hopperTierToRouteRole(tier: ModelHopperTier): ModelRouteRole {
  return normalizeModelRouteRole(normalizeHopperTier(tier))
}

export function modelRouteTierBorderSx(theme: Theme, tier: ModelHopperTier) {
  return {
    borderLeftWidth: 4,
    borderLeftStyle: 'solid' as const,
    borderLeftColor: modelRouteAccentColor(theme, hopperTierToRouteRole(tier)),
  }
}

export function ModelRouteTierDot({
  tier,
  width = 10,
  height = 10,
}: {
  tier: ModelHopperTier
  width?: number
  height?: number
}) {
  const theme = useTheme()
  return (
    <Box
      sx={{
        width,
        height,
        borderRadius: 0.5,
        bgcolor: modelRouteAccentColor(theme, hopperTierToRouteRole(tier)),
        flexShrink: 0,
      }}
      aria-hidden
    />
  )
}

export function ModelRouteTierSelectLabel({ tier }: { tier: ModelHopperTier }) {
  const norm = normalizeHopperTier(tier)
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <ModelRouteTierDot tier={norm} />
      <span>
        {hopperTierLabel(norm)} · {modelRouteRoleLabel(hopperTierToRouteRole(norm))}
      </span>
    </Stack>
  )
}

const LEGEND_TIERS: ModelHopperTier[] = ['fast', 'code', 'think']

/** Matches chat assistant left-edge colors. */
export function ModelRouteTierLegend() {
  const theme = useTheme()
  return (
    <Stack
      direction="row"
      flexWrap="wrap"
      gap={1.5}
      useFlexGap
      data-testid="model-route-tier-legend"
    >
      {LEGEND_TIERS.map((tier) => {
        const norm = normalizeHopperTier(tier)
        const role = hopperTierToRouteRole(norm)
        return (
          <Stack key={norm} direction="row" spacing={0.75} alignItems="center">
            <Box
              sx={{
                width: 4,
                height: 18,
                borderRadius: 0.5,
                bgcolor: modelRouteAccentColor(theme, role),
              }}
              aria-hidden
            />
            <Typography variant="caption" color="text.secondary">
              {hopperTierLabel(norm)} · {modelRouteRoleLabel(role)}
            </Typography>
          </Stack>
        )
      })}
    </Stack>
  )
}

export function ModelRouteTierRouteLine({
  tier,
  model,
}: {
  tier: ModelHopperTier
  model: string
}) {
  const theme = useTheme()
  const norm = normalizeHopperTier(tier)
  const role = hopperTierToRouteRole(norm)
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" component="span">
      <Box
        component="span"
        sx={{
          display: 'inline-block',
          width: 4,
          height: 14,
          borderRadius: 0.5,
          bgcolor: modelRouteAccentColor(theme, role),
          verticalAlign: 'middle',
        }}
        aria-hidden
      />
      <Typography component="span" variant="caption" color="text.secondary">
        {hopperTierLabel(norm)} →{' '}
        <Typography component="span" variant="caption" fontFamily="monospace">
          {model}
        </Typography>
      </Typography>
    </Stack>
  )
}
