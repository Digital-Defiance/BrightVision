import { Box, LinearProgress, Typography } from '@mui/material'
import { ThinkingTimerInline } from '../chat/ThinkingTimerBar'
import { useMonotonicEtaProgress } from '../../hooks/useMonotonicEtaProgress'
import { isTurnEtaVisible } from '../../utils/turnEtaEstimate'
import type { TurnEtaEstimate } from '../../utils/turnEtaEstimate'
import type { LiveThinkingState } from '../../utils/thinkingTiming'
import type { ProcessSnapshot } from '../../progress/types'
import './VisionActivityBar.scss'

/** Background spec generate/refine job (does not use core SSE progress). */
export interface SpecJobActivity {
  active: boolean
  label?: string
  detail?: string
}

interface VisionActivityBarProps {
  process: ProcessSnapshot
  specJob?: SpecJobActivity | null
  liveTiming?: LiveThinkingState | null
  turnEta?: TurnEtaEstimate | null
}

export function VisionActivityBar({
  process,
  specJob = null,
  liveTiming = null,
  turnEta = null,
}: VisionActivityBarProps) {
  const specActive = Boolean(specJob?.active)
  const chatActive = process.active
  const show =
    chatActive || process.phase === 'error' || liveTiming != null || specActive
  const showingSpec = specActive && !chatActive && process.phase !== 'error'
  const etaVisible = isTurnEtaVisible(turnEta)
  const etaPct = useMonotonicEtaProgress(
    show ? turnEta : null,
    liveTiming?.responseElapsedMs ?? 0
  )

  if (!show) return null

  const indeterminate = showingSpec ? true : process.progress === null
  const pct =
    !showingSpec && process.progress !== null
      ? Math.round(Math.min(1, Math.max(0, process.progress)) * 100)
      : null

  const countLabel =
    !showingSpec && process.current != null && process.total != null && process.total > 0
      ? `${process.current}/${process.total}`
      : null

  const phaseClass = chatActive
    ? `vision-activity--${process.phase}`
    : showingSpec
      ? 'vision-activity--reasoning vision-activity--spec-job'
      : 'vision-activity--reasoning'
  const primaryLabel = chatActive
    ? process.label
    : showingSpec
      ? (specJob?.label ?? 'GENERATING SPEC')
      : (liveTiming?.phaseLabel.toUpperCase() ?? 'WORKING')
  const detailLine = chatActive
    ? countLabel && process.detail
      ? `${countLabel} · ${process.detail}`
      : countLabel || process.detail
    : showingSpec
      ? specJob?.detail
      : undefined

  return (
    <Box
      className={`vision-activity ${phaseClass}`}
      role="status"
      aria-live="polite"
      aria-valuenow={pct ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      data-testid="vision-activity"
      data-phase={chatActive ? process.phase : showingSpec ? 'spec_job' : 'timing'}
      data-spec-job={showingSpec ? 'true' : undefined}
      data-indeterminate={indeterminate ? 'true' : 'false'}
    >
      <LinearProgress
        className="vision-activity__bar"
        variant={indeterminate ? 'indeterminate' : 'determinate'}
        value={pct ?? 0}
        sx={{
          height: 6,
          borderRadius: 999,
          bgcolor: 'action.hover',
          '& .MuiLinearProgress-bar': {
            borderRadius: 999,
            background: (theme) =>
              process.phase === 'error'
                ? `linear-gradient(90deg, ${theme.palette.warning.main}, ${theme.palette.error.main})`
                : `linear-gradient(90deg, #7c3aed, #22d3ee)`,
          },
        }}
      />
      <Box className="vision-activity__meta">
        <Box className="vision-activity__meta-primary">
          <Typography variant="caption" className="vision-activity__label" component="span">
            {primaryLabel}
            {pct != null && (
              <Box component="span" className="vision-activity__pct" sx={{ ml: 1 }}>
                {pct}%
              </Box>
            )}
          </Typography>
          {detailLine && (
            <Typography variant="caption" className="vision-activity__detail" component="span">
              {detailLine}
            </Typography>
          )}
        </Box>
        {(liveTiming || (etaVisible && etaPct != null)) && (
          <Box className="vision-activity__meta-trailing">
            {liveTiming && <ThinkingTimerInline live={liveTiming} eta={turnEta} />}
            {etaVisible && etaPct != null && (
              <LinearProgress
                className="vision-activity__bar vision-activity__bar--eta"
                variant="determinate"
                value={etaPct}
                data-testid="vision-activity-eta"
                aria-label="Estimated time remaining"
                sx={{
                  flex: '1 1 120px',
                  minWidth: 80,
                  maxWidth: 280,
                  height: 4,
                  borderRadius: 999,
                  bgcolor: 'action.hover',
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 999,
                    transition: 'transform 0.4s ease-out',
                    background: (theme) =>
                      `linear-gradient(90deg, ${theme.palette.success.dark}, ${theme.palette.success.main})`,
                  },
                }}
              />
            )}
          </Box>
        )}
      </Box>
    </Box>
  )
}
