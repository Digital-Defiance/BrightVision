import { Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { bdFromUnixMs, formatBdScalar } from './brightdateTiming'
import { formatEtcClock } from './stepTiming'
import { fmtDuration } from './testSuiteClient'

const GRID_COLS = 'minmax(4.5rem, 2.4fr) repeat(3, minmax(3.25rem, 1fr))'

type Props = {
  stepIndex: number
  stepTotal: number
  stepElapsed: number
  /** Wall clock when the current step started (client-side, from step_started). */
  stepStartedAtMs?: number | null
  etaTotal: number
  runUseBrightDate: boolean
  stepEtc?: string
  /** Median-based time left in the suite (primary Suite ETC line). */
  suiteLeft?: string
  /** Fixed finish instant for the suite (secondary Suite ETC line). */
  suiteFinishEtc?: string
  /** Within-step test progress (e.g. ``2/23 tests``) — Step column only. */
  substepLabel?: string | null
}

function HeaderCell({ children }: { children: string }) {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.3 }}>
      {children}
    </Typography>
  )
}

function ValueCell({
  children,
  title,
}: {
  children: ReactNode
  title?: string
}) {
  return (
    <Typography
      variant="caption"
      component="div"
      title={title}
      sx={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.35, wordBreak: 'break-word' }}
    >
      {children}
    </Typography>
  )
}

function SecondaryLine({ children }: { children: string }) {
  return (
    <Typography
      component="span"
      variant="caption"
      color="text.secondary"
      sx={{ display: 'block', fontSize: '0.68rem', lineHeight: 1.25, mt: 0.1 }}
    >
      {children}
    </Typography>
  )
}

function TwoLineValue({
  primary,
  secondary,
}: {
  primary: string
  secondary?: string | null
}) {
  return (
    <>
      {primary}
      {secondary != null && secondary !== '' && <SecondaryLine>{secondary}</SecondaryLine>}
    </>
  )
}

function fmtStepStartLabel(stepStartedAtMs: number, useBrightDate: boolean): string {
  if (useBrightDate) {
    return formatBdScalar(bdFromUnixMs(stepStartedAtMs), 4)
  }
  return new Date(stepStartedAtMs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function SuiteProgressTable({
  stepIndex,
  stepTotal,
  stepElapsed,
  stepStartedAtMs,
  etaTotal,
  runUseBrightDate,
  stepEtc,
  suiteLeft,
  suiteFinishEtc,
  substepLabel,
}: Props) {
  const dash = '—'
  const stepActive = stepStartedAtMs != null
  const showStepTime = stepActive || stepElapsed > 0
  const stepTimeLabel = showStepTime
    ? fmtDuration(Math.max(0, stepElapsed), runUseBrightDate)
    : dash
  const stepStartLabel =
    stepActive && stepStartedAtMs != null
      ? fmtStepStartLabel(stepStartedAtMs, runUseBrightDate)
      : null

  const suiteLeftLabel =
    suiteLeft ?? (etaTotal > 0 ? `~${fmtDuration(etaTotal, runUseBrightDate)}` : null)
  const suiteFinishLabel =
    suiteFinishEtc ??
    (suiteLeftLabel != null && etaTotal > 0
      ? formatEtcClock(etaTotal, { useBrightDate: runUseBrightDate })
      : null)
  const showSuiteEtc = suiteLeftLabel != null

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: GRID_COLS,
        columnGap: 2,
        rowGap: 0.35,
        alignItems: 'baseline',
        mb: 0.5,
      }}
    >
      <HeaderCell>Step</HeaderCell>
      <HeaderCell>Step time</HeaderCell>
      <HeaderCell>Step ETC</HeaderCell>
      <HeaderCell>Suite ETC</HeaderCell>
      <Box
        sx={{
          gridColumn: '1 / -1',
          borderBottom: 1,
          borderColor: 'divider',
          opacity: 0.55,
          my: 0.2,
        }}
      />
      <ValueCell>
        <TwoLineValue
          primary={`${stepIndex}/${stepTotal}`}
          secondary={substepLabel}
        />
      </ValueCell>
      <ValueCell>
        {showStepTime ? (
          <TwoLineValue primary={stepTimeLabel} secondary={stepStartLabel} />
        ) : (
          dash
        )}
      </ValueCell>
      <ValueCell>{stepEtc ?? dash}</ValueCell>
      <ValueCell>
        {showSuiteEtc ? (
          <TwoLineValue primary={suiteLeftLabel!} secondary={suiteFinishLabel} />
        ) : (
          dash
        )}
      </ValueCell>
    </Box>
  )
}
