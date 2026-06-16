import { Chip } from '@mui/material'
import type { ReactNode } from 'react'
import { fmtDurationBrightDate, formatBdBounds } from './stepTiming'
import { fmtDuration } from './testSuiteClient'

export const COMPACT_CHIP_SX = {
  height: 22,
  '& .MuiChip-label': { px: 0.75, fontSize: '0.68rem', lineHeight: 1.2 },
} as const

type StepMeta = {
  seconds?: number
  gpuAvg?: number
  gpuPeak?: number
  memAvg?: number
  memPeak?: number
  memPressurePeak?: number
  swapPeakGb?: number
  liveGpuAvg?: number
  liveGpuPeak?: number
  liveMemAvg?: number
  liveMemPeak?: number
  gpuWarn?: boolean
  gpuExpectedPeak?: number
  startBd?: number
  endBd?: number
}

type TimingMeta = {
  eta?: string
  etc?: string
  runEtc?: string
  substepLabel?: string
}

type Props = {
  step: StepMeta
  timing: TimingMeta
  runUseBrightDate: boolean
}

export default function StepMetaChips({ step, timing, runUseBrightDate }: Props) {
  const chips: ReactNode[] = []

  if (timing.eta) {
    chips.push(
      <Chip key="eta" size="small" label={timing.eta} variant="outlined" color="info" sx={COMPACT_CHIP_SX} />
    )
  }
  if (timing.substepLabel) {
    chips.push(
      <Chip
        key="substep"
        size="small"
        label={timing.substepLabel}
        variant="outlined"
        color="primary"
        sx={COMPACT_CHIP_SX}
      />
    )
  }
  if (timing.etc) {
    chips.push(
      <Chip key="etc" size="small" label={timing.etc} variant="outlined" color="info" sx={COMPACT_CHIP_SX} />
    )
  }
  if (timing.runEtc) {
    chips.push(
      <Chip key="runEtc" size="small" label={timing.runEtc} variant="outlined" sx={COMPACT_CHIP_SX} />
    )
  }
  if (step.seconds != null) {
    chips.push(
      <Chip
        key="dur"
        size="small"
        label={runUseBrightDate ? fmtDurationBrightDate(step.seconds) : fmtDuration(step.seconds)}
        variant="outlined"
        sx={COMPACT_CHIP_SX}
      />
    )
  }
  const bd = formatBdBounds(step.startBd, step.endBd)
  if (bd) {
    chips.push(
      <Chip
        key="bd"
        size="small"
        label={bd}
        variant="outlined"
        title="Wall interval from btime / bgpucap (BrightDate)"
        sx={COMPACT_CHIP_SX}
      />
    )
  }
  if (
    step.gpuAvg != null ||
    step.gpuPeak != null ||
    step.liveGpuPeak != null ||
    step.liveGpuAvg != null
  ) {
    chips.push(
      <Chip
        key="gpu"
        size="small"
        label={`GPU ${Math.round(step.gpuAvg ?? step.liveGpuAvg ?? step.liveGpuPeak ?? 0)}% / ${Math.round(step.gpuPeak ?? step.liveGpuPeak ?? 0)}%${
          step.gpuExpectedPeak != null ? ` (~${Math.round(step.gpuExpectedPeak)}%)` : ''
        }`}
        color={
          step.gpuWarn
            ? 'error'
            : (step.gpuPeak ?? step.liveGpuPeak ?? 0) >= 50
              ? 'warning'
              : 'default'
        }
        variant="outlined"
        title={step.gpuWarn ? 'GPU usage is far below historical median for this step' : undefined}
        sx={COMPACT_CHIP_SX}
      />
    )
  }
  if (step.memPeak != null || step.liveMemPeak != null) {
    chips.push(
      <Chip
        key="ram"
        size="small"
        label={`RAM ${Math.round(step.memAvg ?? step.liveMemAvg ?? 0)}% / ${Math.round(step.memPeak ?? step.liveMemPeak ?? 0)}%`}
        color={(step.memPeak ?? step.liveMemPeak ?? 0) >= 85 ? 'warning' : 'default'}
        variant="outlined"
        sx={COMPACT_CHIP_SX}
      />
    )
  }
  if (step.memPressurePeak != null && step.memPressurePeak >= 1) {
    chips.push(
      <Chip
        key="pressure"
        size="small"
        label={`pressure ${step.memPressurePeak.toFixed(0)}`}
        color={step.memPressurePeak >= 2 ? 'error' : 'warning'}
        variant="outlined"
        sx={COMPACT_CHIP_SX}
      />
    )
  }
  if (step.swapPeakGb != null && step.swapPeakGb > 0.01) {
    chips.push(
      <Chip
        key="swap"
        size="small"
        label={`swap ${step.swapPeakGb}G`}
        color="warning"
        variant="outlined"
        sx={COMPACT_CHIP_SX}
      />
    )
  }

  if (chips.length === 0) return null
  return <>{chips}</>
}
