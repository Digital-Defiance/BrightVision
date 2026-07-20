import type { CoreTurnCapture } from '@brightvision/vision-client'
import type { TurnResourceStats } from '../ipc/resourceSnapshot'

/** Prefer core bgpucap/heartbeat peaks when higher than Tauri poll peaks. */
export function mergeTurnCaptureWithResourceStats(
  polled: TurnResourceStats | undefined,
  capture: CoreTurnCapture | undefined
): TurnResourceStats | undefined {
  if (!capture) return polled
  const n = Math.max(capture.sampleCount ?? 0, polled?.sampleCount ?? 0) || 1
  const pickPeak = (a: number | null | undefined, b: number | null | undefined) => {
    if (a == null || !Number.isFinite(a)) return b ?? undefined
    if (b == null || !Number.isFinite(b)) return a
    return Math.max(a, b)
  }
  const pickAvg = (a: number | undefined, b: number | undefined) => a ?? b

  if (!polled) {
    if (
      capture.cpuPeak == null &&
      capture.memPeak == null &&
      capture.gpuPeak == null
    ) {
      return undefined
    }
    return {
      peakCpuPct: capture.cpuPeak ?? 0,
      peakMemPct: capture.memPeak ?? 0,
      peakGpuPct: capture.gpuPeak ?? null,
      avgCpuPct: capture.cpuAvg ?? capture.cpuPeak ?? 0,
      avgMemPct: capture.memAvg ?? capture.memPeak ?? 0,
      avgGpuPct: capture.gpuAvg ?? capture.gpuPeak ?? null,
      sampleCount: n,
    }
  }

  return {
    peakCpuPct: pickPeak(polled.peakCpuPct, capture.cpuPeak) ?? polled.peakCpuPct,
    peakMemPct: pickPeak(polled.peakMemPct, capture.memPeak) ?? polled.peakMemPct,
    peakGpuPct:
      pickPeak(polled.peakGpuPct, capture.gpuPeak ?? null) ?? polled.peakGpuPct,
    avgCpuPct: pickAvg(capture.cpuAvg, polled.avgCpuPct) ?? polled.avgCpuPct,
    avgMemPct: pickAvg(capture.memAvg, polled.avgMemPct) ?? polled.avgMemPct,
    avgGpuPct:
      pickAvg(capture.gpuAvg ?? undefined, polled.avgGpuPct ?? undefined) ??
      polled.avgGpuPct,
    sampleCount: n,
  }
}

export function turnCaptureExtras(
  capture: CoreTurnCapture | undefined
): {
  startBd?: number
  endBd?: number
  memPressurePeak?: number
  captureMode?: string
} {
  if (!capture) return {}
  return {
    ...(capture.startBd != null ? { startBd: capture.startBd } : {}),
    ...(capture.endBd != null ? { endBd: capture.endBd } : {}),
    ...(capture.memPressurePeak != null
      ? { memPressurePeak: capture.memPressurePeak }
      : {}),
    ...(capture.captureMode ? { captureMode: capture.captureMode } : {}),
  }
}
