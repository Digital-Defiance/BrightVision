import { Box, Tooltip, Typography } from '@mui/material'
import type { TurnEtaEstimate } from '../../utils/turnEtaEstimate'
import type { LiveThinkingState } from '../../utils/thinkingTiming'
import { formatDurationMs } from '../../utils/thinkingTiming'

/** Compact Response / Think / ETA display for the top activity bar. */
export function ThinkingTimerInline({
  live,
  eta = null,
  agentMs = null,
  formatDuration = formatDurationMs,
}: {
  live: LiveThinkingState
  eta?: TurnEtaEstimate | null
  /** Cumulative agent-phase wall time this session (slash /agent work). */
  agentMs?: number | null
  formatDuration?: (ms: number) => string
}) {
  return (
    <Box
      component="span"
      data-testid="thinking-timer"
      className="vision-activity__timing"
      sx={{
        fontFamily: 'var(--vision-font-chat, monospace)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: '0.7rem',
        fontWeight: 500,
        letterSpacing: '0.01em',
        textTransform: 'none',
        color: 'text.secondary',
        display: 'inline-flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 0.5,
      }}
    >
      <span>
        Response{' '}
        <Box component="span" sx={{ color: 'primary.light' }}>
          {formatDuration(live.responseElapsedMs)}
        </Box>
        {' · Think '}
        <Box component="span" sx={{ color: 'secondary.light' }}>
          {formatDuration(live.thoughtElapsedMs)}
        </Box>
        {agentMs != null && agentMs > 0 && (
          <>
            {' · Agent '}
            <Box component="span" sx={{ color: 'warning.light' }}>
              {formatDuration(agentMs)}
            </Box>
          </>
        )}
      </span>
      {eta?.shortLabel && (
        <Tooltip title={eta.tooltip} enterDelay={400}>
          <Box
            component="span"
            sx={{ color: 'info.light', cursor: 'help' }}
            data-testid="thinking-timer-eta"
          >
            · {eta.shortLabel}
          </Box>
        </Tooltip>
      )}
    </Box>
  )
}

/** @deprecated Use ThinkingTimerInline in VisionActivityBar */
export function ThinkingTimerBar({
  live,
  eta = null,
}: {
  live: LiveThinkingState
  lastEventAgoMs?: number | null
  eta?: TurnEtaEstimate | null
}) {
  return (
    <Typography
      data-testid="thinking-timer"
      variant="caption"
      color="text.secondary"
      sx={{
        px: 1,
        py: 0.75,
        fontSize: '0.72rem',
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'action.hover',
        fontFamily: 'var(--vision-font-chat, monospace)',
      }}
    >
      <ThinkingTimerInline live={live} eta={eta} />
    </Typography>
  )
}
