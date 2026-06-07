import type { LocalLlmSnapshot } from '../ipc/localLlm'
import { isOllamaVisionModel, ollamaChatModelFromTag } from '../ipc/localLlm'
import { MODEL_ROUTER_PREFS_STORAGE_KEY } from '../storageKeys'
import {
  DEFAULT_MODEL_HOPPER,
  createHopperEntry,
  migrateLegacyRouterModels,
  normalizeHopperEntries,
  normalizeHopperTier,
  resolveHopperEnableThinking,
  parseHopperExtraParams,
  resolveHopperModels,
  syncSessionModelToHopper,
  type ModelHopperEntry,
  type ModelHopperTier,
} from './modelHopper'

export { MODEL_ROUTER_PREFS_STORAGE_KEY }
export type { ModelHopperEntry } from './modelHopper'

export interface ModelRouterPrefs {
  enabled: boolean
  /** User toggled the router switch in Settings (do not auto-enable when false). */
  routerEnabledUserSet?: boolean
  /** Ordered pool of local models (on/off + fast/code/think tier). */
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
  /** @deprecated Migrated into `models` on load. */
  thinkModel?: string
}

export const DEFAULT_MODEL_ROUTER_PREFS: ModelRouterPrefs = {
  enabled: false,
  models: [...DEFAULT_MODEL_HOPPER],
  tokenFastMax: 4096,
  tokenHeavyMin: 12000,
  keepAliveFastSec: 300,
  keepAliveHeavySec: -1,
  escalateOnFailure: true,
}

export function normalizeKeepAliveHeavySec(sec: number): number {
  return sec === 0 ? -1 : sec
}

export function normalizeModelRouterPrefs(prefs: ModelRouterPrefs): ModelRouterPrefs {
  const keepAliveHeavySec = normalizeKeepAliveHeavySec(prefs.keepAliveHeavySec)
  if (keepAliveHeavySec === prefs.keepAliveHeavySec) return prefs
  return { ...prefs, keepAliveHeavySec }
}

/** Router on when Ollama + enabled fast tier, unless user opted out or env disables. */
export function effectiveRouterEnabled(
  prefs: ModelRouterPrefs,
  sessionModel: string,
  modelRouterEnv?: boolean | null
): boolean {
  if (modelRouterEnv === false) return false
  if (!isOllamaVisionModel(sessionModel)) return false
  const { fast } = resolveHopperModels(prefs.models, sessionModel)
  if (!fast) return false
  if (modelRouterEnv === true) return true
  if (prefs.routerEnabledUserSet) return prefs.enabled
  return true
}

export function loadModelRouterPrefs(): ModelRouterPrefs {
  try {
    const raw = localStorage.getItem(MODEL_ROUTER_PREFS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_MODEL_ROUTER_PREFS }
    const parsed = JSON.parse(raw) as Partial<ModelRouterPrefs>
    const models = migrateLegacyRouterModels(parsed)
    const loaded: ModelRouterPrefs = {
      ...DEFAULT_MODEL_ROUTER_PREFS,
      ...parsed,
      models,
      tokenFastMax: Number(parsed.tokenFastMax) || DEFAULT_MODEL_ROUTER_PREFS.tokenFastMax,
      tokenHeavyMin: Number(parsed.tokenHeavyMin) || DEFAULT_MODEL_ROUTER_PREFS.tokenHeavyMin,
      keepAliveFastSec:
        Number(parsed.keepAliveFastSec) ?? DEFAULT_MODEL_ROUTER_PREFS.keepAliveFastSec,
      keepAliveHeavySec: Number.isFinite(Number(parsed.keepAliveHeavySec))
        ? Number(parsed.keepAliveHeavySec)
        : DEFAULT_MODEL_ROUTER_PREFS.keepAliveHeavySec,
    }
    const normalized = normalizeModelRouterPrefs(loaded)
    if (normalized.keepAliveHeavySec !== loaded.keepAliveHeavySec) {
      try {
        saveModelRouterPrefs(normalized)
      } catch {
        /* ignore quota / private mode */
      }
    }
    return normalized
  } catch {
    return { ...DEFAULT_MODEL_ROUTER_PREFS }
  }
}

export function saveModelRouterPrefs(prefs: ModelRouterPrefs): void {
  const normalized = normalizeModelRouterPrefs(prefs)
  const { fastModel: _f, heavyModel: _h, thinkModel: _t, ...rest } = normalized
  localStorage.setItem(MODEL_ROUTER_PREFS_STORAGE_KEY, JSON.stringify(rest))
}

function hopperTierHasModel(models: ModelHopperEntry[], tier: ModelHopperTier): boolean {
  const norm = normalizeHopperTier(tier)
  return models.some((m) => {
    if (!m.enabled || normalizeHopperTier(m.tier) !== norm) return false
    if (norm === 'code') return true
    return Boolean(m.model.trim())
  })
}

function setHopperTierFromEnv(
  models: ModelHopperEntry[],
  tier: ModelHopperTier,
  liteLlmModel: string,
  rawTag: string,
  envKey: string,
  enableThinking?: boolean | null
): ModelHopperEntry[] {
  const norm = normalizeHopperTier(tier)
  const idx = models.findIndex((m) => normalizeHopperTier(m.tier) === norm)
  const label = `Env ${envKey}: ${rawTag}`
  const thinkPatch =
    enableThinking === true || enableThinking === false ? { enableThinking } : {}
  if (idx >= 0) {
    return models.map((m, i) =>
      i === idx
        ? { ...m, tier: norm, model: liteLlmModel, label, enabled: true, ...thinkPatch }
        : m
    )
  }
  return [
    ...models,
    createHopperEntry({ tier: norm, model: liteLlmModel, enabled: true, label, ...thinkPatch }),
  ]
}

function applyHopperThinkFlagsFromEnv(
  models: ModelHopperEntry[],
  snap: LocalLlmSnapshot
): ModelHopperEntry[] {
  const tierThink: Partial<Record<'fast' | 'code', boolean>> = {}
  if (snap.fastThink === true || snap.fastThink === false) tierThink.fast = snap.fastThink
  if (snap.codeThink === true || snap.codeThink === false) tierThink.code = snap.codeThink
  if (!Object.keys(tierThink).length) return models
  return models.map((m) => {
    const tier = normalizeHopperTier(m.tier)
    if (tier === 'fast' && tierThink.fast !== undefined) {
      return { ...m, enableThinking: tierThink.fast }
    }
    if (tier === 'code' && tierThink.code !== undefined) {
      return { ...m, enableThinking: tierThink.code }
    }
    return m
  })
}

/**
 * Apply router env vars from local-llm into the hopper.
 * `fillEmpty` — only overwrite slots that are unset (startup); `false` on Sync button.
 */
export function applyLocalLlmHopperFromEnv(
  prefs: ModelRouterPrefs,
  snap: LocalLlmSnapshot,
  sessionModel: string,
  fillEmpty: boolean
): ModelRouterPrefs {
  const fastTag = snap.fastModel?.trim()
  const codeTag = snap.codeModel?.trim() || snap.heavyModel?.trim()
  const thinkTag = snap.thinkModel?.trim()
  const routerFlag = snap.modelRouter
  if (!fastTag && !codeTag && !thinkTag && routerFlag == null) {
    return prefs
  }

  let models = normalizeHopperEntries(prefs.models)

  if (fastTag && (!fillEmpty || !hopperTierHasModel(models, 'fast'))) {
    models = setHopperTierFromEnv(
      models,
      'fast',
      ollamaChatModelFromTag(fastTag),
      fastTag,
      'FAST_MODEL',
      snap.fastThink
    )
  }

  if (codeTag && (!fillEmpty || !hopperTierHasModel(models, 'code'))) {
    models = setHopperTierFromEnv(
      models,
      'code',
      ollamaChatModelFromTag(codeTag),
      codeTag,
      snap.codeModel?.trim() ? 'CODE_MODEL' : 'HEAVY_MODEL',
      snap.codeThink
    )
  } else if (fastTag && !codeTag) {
    models = syncSessionModelToHopper(models, sessionModel)
  }

  if (thinkTag && (!fillEmpty || !hopperTierHasModel(models, 'think'))) {
    models = setHopperTierFromEnv(
      models,
      'think',
      ollamaChatModelFromTag(thinkTag),
      thinkTag,
      'THINK_MODEL'
    )
  }

  models = applyHopperThinkFlagsFromEnv(models, snap)

  let enabled = prefs.enabled
  let routerEnabledUserSet = prefs.routerEnabledUserSet ?? false
  if (routerFlag === true) {
    enabled = true
    if (!fillEmpty) routerEnabledUserSet = true
  } else if (routerFlag === false && !fillEmpty) {
    enabled = false
    routerEnabledUserSet = true
  } else if (fastTag && fillEmpty && !routerEnabledUserSet) {
    enabled = true
  }

  return { ...prefs, models, enabled, routerEnabledUserSet }
}

export function modelRouterApiPayload(
  prefs: ModelRouterPrefs,
  sessionModel: string,
  modelRouterEnv?: boolean | null
): Record<string, unknown> | undefined {
  if (!effectiveRouterEnabled(prefs, sessionModel, modelRouterEnv)) {
    return undefined
  }
  const { fast, code, think } = resolveHopperModels(prefs.models, sessionModel)
  if (!fast) return undefined

  return {
    enabled: true,
    fast_model: fast,
    heavy_model: code,
    code_model: code,
    think_model: think ?? undefined,
    model_pool: prefs.models.map((m) => {
      const row: Record<string, unknown> = {
        model: m.model,
        tier: normalizeHopperTier(m.tier),
        enabled: m.enabled,
        label: m.label ?? '',
        enable_thinking: resolveHopperEnableThinking(m),
      }
      const extra = parseHopperExtraParams(m.extraParams)
      if (extra) row.extra_params = extra
      return row
    }),
    token_fast_max: prefs.tokenFastMax,
    token_heavy_min: prefs.tokenHeavyMin,
    keep_alive_fast: prefs.keepAliveFastSec,
    keep_alive_heavy: normalizeKeepAliveHeavySec(prefs.keepAliveHeavySec),
    escalate_on_failure: prefs.escalateOnFailure,
  }
}

export type ModelRouteRole = 'fast' | 'code' | 'think'

export function normalizeModelRouteRole(tier: string | undefined): ModelRouteRole {
  if (tier === 'think') return 'think'
  if (tier === 'code' || tier === 'heavy') return 'code'
  return 'fast'
}

export function formatModelRouteEvent(ev: {
  tier?: string
  role?: string
  model?: string
  estimated_tokens?: number
  reasons?: string[]
  escalated?: boolean
  load_ms?: number
  swapped?: boolean
  enable_thinking?: boolean | null
}): string {
  const role = normalizeModelRouteRole(ev.role ?? ev.tier)
  const tierLabel =
    role === 'fast' ? 'Fighter pilot' : role === 'think' ? 'Architect' : 'Engineer'
  const model = ev.model ?? 'model'
  const tok = ev.estimated_tokens != null ? ` · ~${ev.estimated_tokens} tok` : ''
  const why = ev.reasons?.length ? ` (${ev.reasons.join(', ')})` : ''
  const up = ev.escalated ? ' · escalated' : ''
  const think =
    ev.enable_thinking === true
      ? ' · think:on'
      : ev.enable_thinking === false
        ? ' · think:off'
        : ''
  const swap =
    ev.load_ms != null && ev.load_ms > 0
      ? ` · swap ${ev.load_ms}ms${ev.swapped ? ' (unload+load)' : ''}`
      : ''
  return `${tierLabel}: ${model}${tok}${why}${up}${think}${swap}`
}
