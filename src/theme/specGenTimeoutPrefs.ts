import { SPEC_GEN_TIMEOUT_STORAGE_KEY } from '../storageKeys'

/** User-facing spec generate timeouts (sent per job to Vision API). */
export interface SpecGenTimeoutPrefs {
  /** Wall clock for the whole background job (seconds). */
  wallTimeoutS: number
  /** Per LLM turn inside generate-spec (seconds). */
  turnTimeoutS: number
}

export const SPEC_GEN_TIMEOUT_PRESETS = {
  default: { wallTimeoutS: 1200, turnTimeoutS: 720, label: 'Standard (20 min)' },
  extended: { wallTimeoutS: 2400, turnTimeoutS: 1200, label: 'Extended (40 min)' },
} as const

export const DEFAULT_SPEC_GEN_TIMEOUT_PREFS: SpecGenTimeoutPrefs = {
  wallTimeoutS: SPEC_GEN_TIMEOUT_PRESETS.default.wallTimeoutS,
  turnTimeoutS: SPEC_GEN_TIMEOUT_PRESETS.default.turnTimeoutS,
}

function clampTimeout(raw: unknown, fallback: number, min = 60, max = 7200): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function loadSpecGenTimeoutPrefs(): SpecGenTimeoutPrefs {
  try {
    const raw = localStorage.getItem(SPEC_GEN_TIMEOUT_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SPEC_GEN_TIMEOUT_PREFS }
    const parsed = JSON.parse(raw) as Partial<SpecGenTimeoutPrefs>
    const wallTimeoutS = clampTimeout(parsed.wallTimeoutS, DEFAULT_SPEC_GEN_TIMEOUT_PREFS.wallTimeoutS)
    const turnTimeoutS = clampTimeout(
      parsed.turnTimeoutS,
      DEFAULT_SPEC_GEN_TIMEOUT_PREFS.turnTimeoutS,
      60,
      wallTimeoutS
    )
    return { wallTimeoutS, turnTimeoutS }
  } catch {
    return { ...DEFAULT_SPEC_GEN_TIMEOUT_PREFS }
  }
}

export function saveSpecGenTimeoutPrefs(prefs: SpecGenTimeoutPrefs): void {
  localStorage.setItem(SPEC_GEN_TIMEOUT_STORAGE_KEY, JSON.stringify(prefs))
}

export function formatSpecGenTimeoutLabel(prefs: SpecGenTimeoutPrefs): string {
  const wallMin = Math.round(prefs.wallTimeoutS / 60)
  const turnMin = Math.round(prefs.turnTimeoutS / 60)
  return `${wallMin} min job / ${turnMin} min per turn`
}

export function extendedSpecGenTimeoutPrefs(): SpecGenTimeoutPrefs {
  return {
    wallTimeoutS: SPEC_GEN_TIMEOUT_PRESETS.extended.wallTimeoutS,
    turnTimeoutS: SPEC_GEN_TIMEOUT_PRESETS.extended.turnTimeoutS,
  }
}
