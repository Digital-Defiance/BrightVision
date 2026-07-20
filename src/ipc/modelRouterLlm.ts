import { invoke } from '@tauri-apps/api/core'
import type { VisionConfig } from './config'
import { isLocalBackendVisionModel, localModelTagFromVisionModel, resolveLocalLlmForConfig } from './localLlm'
import { isTauriRuntime } from './isTauri'
import type { ModelRouterPrefs } from '../theme/modelRouterPrefs'
import { effectiveRouterEnabled, normalizeKeepAliveHeavySec, normalizeModelRouteRole } from '../theme/modelRouterPrefs'
import { normalizeHopperTier, resolveHopperModels } from '../theme/modelHopper'

export interface HopperPrepareEntry {
  model_tag: string
  keep_alive_secs: number
  preload: boolean
  /** Priority rank (0 = highest). Entries are processed in ascending rank order. */
  priority_rank?: number | null
}

export interface OllamaEnsureModelResult {
  logs: string[]
  load_ms: number
  swapped: boolean
}

export type ModelRouteRole = 'fast' | 'code' | 'think'

export interface ModelRouteSnapshot {
  tier: ModelRouteRole | 'heavy'
  role?: ModelRouteRole
  model: string
  estimated_tokens?: number
  reasons?: string[]
  escalated?: boolean
  load_ms?: number
  swapped?: boolean
  enable_thinking?: boolean | null
}

function modelTagFromVisionModel(model: string): string | null {
  return localModelTagFromVisionModel(model)
}

function isLocalLlmSessionModel(config: VisionConfig): boolean {
  const backend = config.model.trim().startsWith('openai/') ? 'lmstudio' : 'ollama'
  return isLocalBackendVisionModel(config.model, backend)
}

function ollamaHostForConfig(config: VisionConfig): string {
  const backend = config.model.trim().startsWith('openai/') ? 'lmstudio' : 'ollama'
  return config.ollamaApiBase.trim() || resolveLocalLlmForConfig(config, backend).ollamaHost
}

function keepAliveForRole(
  role: ModelRouteRole,
  prefs: ModelRouterPrefs
): number {
  if (role === 'fast') return prefs.keepAliveFastSec
  return normalizeKeepAliveHeavySec(prefs.keepAliveHeavySec)
}

/**
 * Session start: ensure resolved fast/code/think route tags exist on disk.
 * No RAM preload (avoids fighting the session model load and 10% UI stalls).
 */
export function buildRouterRoutePullEntries(
  prefs: ModelRouterPrefs,
  sessionModel: string
): HopperPrepareEntry[] {
  const { fast, code, think } = resolveHopperModels(prefs.models, sessionModel)
  const entries: HopperPrepareEntry[] = []
  const seen = new Set<string>()
  for (const spec of [
    { role: 'fast' as const, model: fast },
    { role: 'code' as const, model: code },
    { role: 'think' as const, model: think },
  ]) {
    if (!spec.model) continue
    const tag = modelTagFromVisionModel(spec.model)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    entries.push({
      model_tag: tag,
      keep_alive_secs: keepAliveForRole(spec.role, prefs),
      preload: false,
    })
  }
  return entries
}

/** Full hopper prep: pull every enabled tag; preload first enabled fast (Settings / manual). */
export function buildHopperPrepareEntries(
  prefs: ModelRouterPrefs,
  sessionModel: string
): HopperPrepareEntry[] {
  const entries: HopperPrepareEntry[] = []
  let preloadedFast = false
  for (const row of prefs.models) {
    if (!row.enabled) continue
    const tier = normalizeHopperTier(row.tier)
    const tag = modelTagFromVisionModel(
      row.model.trim() || (tier === 'code' ? sessionModel : '')
    )
    if (!tag) continue
    const preload = tier === 'fast' && !preloadedFast
    if (preload) preloadedFast = true
    entries.push({
      model_tag: tag,
      keep_alive_secs: keepAliveForRole(tier === 'heavy' ? 'code' : tier, prefs),
      preload,
      priority_rank: row.priorityRank ?? null,
    })
  }
  return entries
}

async function invokeHopperPrepare(
  config: VisionConfig,
  entries: HopperPrepareEntry[]
): Promise<string[]> {
  if (entries.length === 0) return []
  return invoke<string[]>('local_llm_prepare_hopper', {
    ollamaHost: ollamaHostForConfig(config),
    entries,
  })
}

/** On Terminal → Start: pull fast/code/think route tags only (no preload). */
export async function prepareModelRouterForSessionStart(
  config: VisionConfig,
  prefs: ModelRouterPrefs,
  modelRouterEnv?: boolean | null
): Promise<string[]> {
  if (
    !isTauriRuntime() ||
    !effectiveRouterEnabled(prefs, config.model, modelRouterEnv) ||
    !isLocalLlmSessionModel(config)
  ) {
    return []
  }
  return invokeHopperPrepare(config, buildRouterRoutePullEntries(prefs, config.model))
}

/** Pull all enabled hopper models + preload first fast (heavy; use from Settings later). */
export async function prepareModelRouterHopper(
  config: VisionConfig,
  prefs: ModelRouterPrefs,
  modelRouterEnv?: boolean | null
): Promise<string[]> {
  if (
    !isTauriRuntime() ||
    !effectiveRouterEnabled(prefs, config.model, modelRouterEnv) ||
    !isLocalLlmSessionModel(config)
  ) {
    return []
  }
  return invokeHopperPrepare(config, buildHopperPrepareEntries(prefs, config.model))
}

export async function ensureRoutedOllamaModel(
  config: VisionConfig,
  prefs: ModelRouterPrefs,
  route: Pick<ModelRouteSnapshot, 'tier' | 'role' | 'model'>,
  modelRouterEnv?: boolean | null
): Promise<OllamaEnsureModelResult | null> {
  if (!isTauriRuntime() || !effectiveRouterEnabled(prefs, config.model, modelRouterEnv)) {
    return null
  }
  const tag = modelTagFromVisionModel(route.model)
  if (!tag) return null
  const role = normalizeModelRouteRole(route.role ?? route.tier)
  return invoke<OllamaEnsureModelResult>('ollama_ensure_model_loaded', {
    ollamaHost: ollamaHostForConfig(config),
    modelTag: tag,
    keepAliveSecs: keepAliveForRole(role, prefs),
  })
}

export function resolvedRouterModels(prefs: ModelRouterPrefs, sessionModel: string) {
  return resolveHopperModels(prefs.models, sessionModel)
}
