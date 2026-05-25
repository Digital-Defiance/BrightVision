import { Box, Typography } from '@mui/material'
import type { ProcessSnapshot } from '../../progress/types'
import './VisionActivityBar.scss'

interface VisionActivityBarProps {
  process: ProcessSnapshot
}

export function VisionActivityBar({ process }: VisionActivityBarProps) {
  const show = process.active || process.phase === 'error'
  if (!show) return null

  const indeterminate = process.progress === null
  const pct =
    process.progress !== null ? Math.round(Math.min(1, Math.max(0, process.progress)) * 100) : 0

  const phaseClass = `vision-activity--${process.phase}`

  return (
    <Box
      className={`vision-activity ${phaseClass}`}
      role="status"
      aria-live="polite"
      data-testid="vision-activity"
      data-phase={process.phase}
    >
      <Box className="vision-activity__track">
        <Box
          className={`vision-activity__fill ${indeterminate ? 'vision-activity__fill--flow' : ''}`}
          style={indeterminate ? undefined : { width: `${pct}%` }}
        />
        <Box className="vision-activity__glow" aria-hidden />
      </Box>
      <Box className="vision-activity__meta">
        <Typography variant="caption" className="vision-activity__label" component="span">
          {process.label}
        </Typography>
        {process.detail && (
          <Typography variant="caption" className="vision-activity__detail" component="span">
            {process.detail}
          </Typography>
        )}
      </Box>
    </Box>
  )
}
