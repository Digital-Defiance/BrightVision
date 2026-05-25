import { Box, Stack, Typography } from '@mui/material'
import { resourceOverlayRows, type ResourceSnapshot } from '../../ipc/resourceSnapshot'
import type { ResourceOverlayPrefs } from '../../theme/resourceOverlayPrefs'

interface ResourceOverlayProps {
  snapshot: ResourceSnapshot | null
  prefs: ResourceOverlayPrefs
  ready: boolean
}

function RailMetricRow({
  label,
  value,
  title,
}: {
  label: string
  value: string
  title?: string
}) {
  return (
    <Box
      title={title}
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 0.5,
        whiteSpace: 'nowrap',
      }}
    >
      <Typography component="span" variant="caption" sx={{ fontSize: 'inherit', opacity: 0.85 }}>
        {label}
      </Typography>
      <Typography
        component="span"
        variant="caption"
        sx={{ fontSize: 'inherit', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Typography>
    </Box>
  )
}

/** Compact CPU/RAM/GPU readout in the nav gap below Settings (bottom of left column). */
export function ResourceOverlay({ snapshot, prefs, ready }: ResourceOverlayProps) {
  const warn = snapshot != null && snapshot.cpuPct >= prefs.warnCpuPct
  const rows = snapshot != null ? resourceOverlayRows(snapshot, prefs.showGpu) : null

  return (
    <Box
      data-testid="resource-overlay"
      role="status"
      aria-live="polite"
      aria-busy={!snapshot}
      sx={{
        pt: 1,
        pb: 0.5,
        borderTop: 1,
        borderColor: warn ? 'warning.dark' : 'divider',
        fontFamily: 'var(--vision-font-terminal, monospace)',
        fontSize: '0.58rem',
        lineHeight: 1.45,
        color: warn ? 'warning.light' : 'text.secondary',
      }}
    >
      {rows ? (
        <Stack spacing={0.35}>
          {rows.map((row) => (
            <RailMetricRow key={row.id} label={row.label} value={row.value} title={row.title} />
          ))}
        </Stack>
      ) : (
        <Typography
          component="div"
          variant="caption"
          sx={{ fontSize: 'inherit', textAlign: 'center' }}
        >
          {ready ? 'unavailable' : '…'}
        </Typography>
      )}
    </Box>
  )
}
