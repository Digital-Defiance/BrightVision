import { isOllamaVisionModel } from '../ipc/localLlm'
import { MODEL_ROUTER_PREFS_STORAGE_KEY } from '../storageKeys'
import {
  DEFAULT_MODEL_HOPPER,
  migrateLegacyRouterModels,
  resolveHopperModels,
  type ModelHopperEntry,
} from './modelHopper'

export { MODEL_ROUTER_PREFS_STORAGE_KEY }
export type { ModelHopperEntry } from './modelHopper'

export interface ModelRouterPrefs {
  enabled: boolean
  /** Ordered pool of local models (on/off + fast/heavy tier). */
  models: ModelHopperEntry[]
  tokenFastMax: number
  tokenHeavyMin: number
  keepAliveFastSec: number
  keepAliveHeavySec: number
  escalateOnFailure: boolean
  /** @deprecated Migrated into `models` on load. */
  fastModel?: string
  /** @deprecated Migrated into `models` on load. */
  heavyModel?: string
}

export const DEFAULT_MODEL_ROUTER_PREFS: ModelRouterPrefs = {
  enabled: false,
  models: [...DEFAULT_MODEL_HOPPER],
  tokenFastMax: 4096,
  tokenHeavyMin: 12000,
  keepAliveFastSec: 300,
  keepAliveHeavySec: 0,
  escalateOnFailure: true,
}

export function loadModelRouterPrefs(): ModelRouterPrefs {
  try {
    const raw = localStorage.getItem(MODEL_ROUTER_PREFS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_MODEL_ROUTER_PREFS }
    const parsed = JSON.parse(raw) as Partial<ModelRouterPrefs>
    const models = migrateLegacyRouterModels(parsed)
    return {
      ...DEFAULT_MODEL_ROUTER_PREFS,
      ...parsed,
      models,
      tokenFastMax: Number(parsed.tokenFastMax) || DEFAULT_MODEL_ROUTER_PREFS.tokenFastMax,
      tokenHeavyMin: Number(parsed.tokenHeavyMin) || DEFAULT_MODEL_ROUTER_PREFS.tokenHeavyMin,
      keepAliveFastSec:
        Number(parsed.keepAliveFastSec) ?? DEFAULT_MODEL_ROUTER_PREFS.keepAliveFastSec,
      keepAliveHeavySec:
        Number(parsed.keepAliveHeavySec) ?? DEFAULT_MODEL_ROUTER_PREFS.keepAliveHeavySec,
    }
  } catch {
    return { ...DEFAULT_MODEL_ROUTER_PREFS }
  }
}

export function saveModelRouterPrefs(prefs: ModelRouterPrefs): void {
  const { fastModel: _f, heavyModel: _h, ...rest } = prefs
  localStorage.setItem(MODEL_ROUTER_PREFS_STORAGE_KEY, JSON.stringify(rest))
}

export function modelRouterApiPayload(
  prefs: ModelRouterPrefs,
  sessionModel: string
): Record<string, unknown> | undefined {
  if (!prefs.enabled || !isOllamaVisionModel(sessionModel)) {
    return undefined
  }
  const { fast, heavy } = resolveHopperModels(prefs.models, sessionModel)
  if (!fast) return undefined

  return {
    enabled: true,
    fast_model: fast,
    heavy_model: heavy,
    model_pool: prefs.models.map((m) => ({
      model: m.model,
      tier: m.tier,
      enabled: m.enabled,
      label: m.label ?? '',
    })),
    token_fast_max: prefs.tokenFastMax,
    token_heavy_min: prefs.tokenHeavyMin,
    keep_alive_fast: prefs.keepAliveFastSec,
    keep_alive_heavy: prefs.keepAliveHeavySec,
    escalate_on_failure: prefs.escalateOnFailure,
  }
}

export function formatModelRouteEvent(ev: {
  tier?: string
  model?: string
  estimated_tokens?: number
  reasons?: string[]
  escalated?: boolean
  load_ms?: number
  swapped?: boolean
}): string {
  const tier = ev.tier === 'fast' ? 'Fighter pilot' : 'Engineer'
  const model = ev.model ?? 'model'
  const tok = ev.estimated_tokens != null ? ` · ~${ev.estimated_tokens} tok` : ''
  const why = ev.reasons?.length ? ` (${ev.reasons.join(', ')})` : ''
  const up = ev.escalated ? ' · escalated' : ''
  const swap =
    ev.load_ms != null && ev.load_ms > 0
      ? ` · swap ${ev.load_ms}ms${ev.swapped ? ' (unload+load)' : ''}`
      : ''
  return `${tier}: ${model}${tok}${why}${up}${swap}`
}
