import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime } from './isTauri'

export interface ResourceSnapshot {
  cpuPct: number
  memUsedMb: number
  memTotalMb: number
  memPct: number
  gpuPct: number | null
  /** `nvidia-smi` | `macos-ioreg` when GPU % is available */
  gpuSource?: string | null
  scope: string
}

export interface ResourceOverlayRow {
  id: 'cpu' | 'ram' | 'gpu'
  label: string
  value: string
  title?: string
}

export async function fetchResourceSnapshot(): Promise<ResourceSnapshot | null> {
  if (!isTauriRuntime()) return null
  try {
    return await invoke<ResourceSnapshot>('get_resource_snapshot')
  } catch {
    return null
  }
}

/** One-line summary (tests / wide layouts). */
export function formatResourceOverlayLine(s: ResourceSnapshot, showGpu: boolean): string {
  return resourceOverlayRows(s, showGpu)
    .map((r) => `${r.value} ${r.label}`.trim())
    .join(' · ')
}

/** Stacked rows for the narrow nav rail — avoids awkward mid-string wraps. */
export function resourceOverlayRows(
  s: ResourceSnapshot,
  showGpu: boolean
): ResourceOverlayRow[] {
  const rows: ResourceOverlayRow[] = [
    { id: 'cpu', label: 'CPU', value: `${s.cpuPct.toFixed(0)}%` },
    {
      id: 'ram',
      label: 'RAM',
      value: `${s.memPct.toFixed(0)}%`,
      title: `${s.memUsedMb} / ${s.memTotalMb} MB system memory`,
    },
  ]
  if (showGpu) {
    rows.push(
      s.gpuPct != null
        ? {
            id: 'gpu',
            label: 'GPU',
            value: `${s.gpuPct.toFixed(0)}%`,
            title:
              s.gpuSource === 'macos-ioreg'
                ? 'Apple GPU (Device Utilization from IOKit)'
                : s.gpuSource === 'nvidia-smi'
                  ? 'NVIDIA GPU (nvidia-smi)'
                  : undefined,
          }
        : {
            id: 'gpu',
            label: 'GPU',
            value: '—',
            title:
              'GPU % unavailable (needs NVIDIA nvidia-smi or Apple Silicon IOKit)',
          }
    )
  }
  return rows
}
