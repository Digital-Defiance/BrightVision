import { Box, Typography } from '@mui/material'
import type { LiveThinkingState } from '../../utils/thinkingTiming'
import { formatDurationMs } from '../../utils/thinkingTiming'

/** Compact Response / Think display for the top activity bar. */
export function ThinkingTimerInline({ live }: { live: LiveThinkingState }) {
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
      }}
    >
      Response{' '}
      <Box component="span" sx={{ color: 'primary.light' }}>
        {formatDurationMs(live.responseElapsedMs)}
      </Box>
      {' · Think '}
      <Box component="span" sx={{ color: 'secondary.light' }}>
        {formatDurationMs(live.thoughtElapsedMs)}
      </Box>
    </Box>
  )
}

/** @deprecated Use ThinkingTimerInline in VisionActivityBar */
export function ThinkingTimerBar({ live }: { live: LiveThinkingState; lastEventAgoMs?: number | null }) {
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
      <ThinkingTimerInline live={live} />
    </Typography>
  )
}
