import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import { Stack, Typography } from '@mui/material'
import type { SubstepProgress } from './pytestSubstepTracker'
import { substepDisplayLines } from './substepDisplay'

type Props = {
  substep: SubstepProgress | null | undefined
  useBrightDate: boolean
  /** Single-line layout for headers and compact rows. */
  inline?: boolean
  compact?: boolean
}

export default function SubstepStatusLines({ substep, useBrightDate, inline, compact }: Props) {
  const lines = substepDisplayLines(substep, useBrightDate)
  if (!lines) return null

  if (inline) {
    const parts: string[] = []
    if (lines.lastDone) {
      parts.push(`${lines.lastDone.label} · ended ${lines.lastDone.endedAt}`)
    }
    if (lines.running) {
      parts.push(
        `${lines.running.label} · ${lines.running.progress} · ${lines.running.elapsed}`
      )
    }
    if (parts.length === 0) return null
    return (
      <Typography
        variant="caption"
        color="text.secondary"
        noWrap
        title={parts.join(' · ')}
        sx={{
          fontSize: '0.68rem',
          lineHeight: 1.3,
          minWidth: 0,
          flex: '1 1 8rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {lines.running ? (
          <>
            <HourglassEmptyIcon
              sx={{ fontSize: 11, verticalAlign: 'text-bottom', mr: 0.35 }}
            />
            {parts[parts.length - 1]}
          </>
        ) : (
          <>
            <CheckCircleIcon
              sx={{ fontSize: 11, verticalAlign: 'text-bottom', mr: 0.35 }}
              color="success"
            />
            {parts[0]}
          </>
        )}
      </Typography>
    )
  }

  const captionSx = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 0.5,
    fontSize: compact ? '0.68rem' : '0.72rem',
    lineHeight: 1.3,
    wordBreak: 'break-word' as const,
  }

  return (
    <Stack spacing={0.25} sx={{ mt: compact ? 0.1 : 0.25 }}>
      {lines.lastDone && (
        <Typography variant="caption" color="text.secondary" sx={captionSx}>
          <CheckCircleIcon sx={{ fontSize: 12, mt: '1px', flexShrink: 0 }} color="success" />
          <span>
            {lines.lastDone.label} · ended {lines.lastDone.endedAt}
          </span>
        </Typography>
      )}
      {lines.running && (
        <Typography variant="caption" color="primary.main" sx={captionSx}>
          <HourglassEmptyIcon sx={{ fontSize: 12, mt: '1px', flexShrink: 0 }} />
          <span>
            {lines.running.label} · started {lines.running.startedAt} · {lines.running.progress} ·{' '}
            {lines.running.elapsed}
          </span>
        </Typography>
      )}
    </Stack>
  )
}
