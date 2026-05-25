import { RESOURCE_OVERLAY_STORAGE_KEY } from '../storageKeys'

export { RESOURCE_OVERLAY_STORAGE_KEY }

export interface ResourceOverlayPrefs {
  showOverlay: boolean
  /** Poll interval in seconds (1–10). */
  pollIntervalSec: number
  showGpu: boolean
  /** CPU % at or above this tints the overlay warning color. */
  warnCpuPct: number
}

export const DEFAULT_RESOURCE_OVERLAY_PREFS: ResourceOverlayPrefs = {
  showOverlay: true,
  pollIntervalSec: 2,
  showGpu: true,
  warnCpuPct: 85,
}

export function loadResourceOverlayPrefs(): ResourceOverlayPrefs {
  try {
    const raw = localStorage.getItem(RESOURCE_OVERLAY_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_RESOURCE_OVERLAY_PREFS }
    const parsed = JSON.parse(raw) as Partial<ResourceOverlayPrefs>
    const poll = parsed.pollIntervalSec ?? DEFAULT_RESOURCE_OVERLAY_PREFS.pollIntervalSec
    return {
      ...DEFAULT_RESOURCE_OVERLAY_PREFS,
      ...parsed,
      pollIntervalSec: Math.min(10, Math.max(1, poll)),
      warnCpuPct: Math.min(100, Math.max(50, parsed.warnCpuPct ?? 85)),
    }
  } catch {
    return { ...DEFAULT_RESOURCE_OVERLAY_PREFS }
  }
}

export function saveResourceOverlayPrefs(prefs: ResourceOverlayPrefs): void {
  localStorage.setItem(RESOURCE_OVERLAY_STORAGE_KEY, JSON.stringify(prefs))
}
