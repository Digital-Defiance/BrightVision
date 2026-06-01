import { invoke } from '@tauri-apps/api/core'
import type { VisionConfig } from './config'
import { isOllamaVisionModel, ollamaTagFromVisionModel, resolveLocalLlmForConfig } from './localLlm'
import { isTauriRuntime } from './isTauri'
import type { ModelRouterPrefs } from '../theme/modelRouterPrefs'
import { resolveHopperModels } from '../theme/modelHopper'

export interface HopperPrepareEntry {
  model_tag: string
  keep_alive_secs: number
  preload: boolean
}

export interface OllamaEnsureModelResult {
  logs: string[]
  load_ms: number
  swapped: boolean
}

export interface ModelRouteSnapshot {
  tier: 'fast' | 'heavy'
  model: string
  estimated_tokens?: number
  reasons?: string[]
  escalated?: boolean
  load_ms?: number
  swapped?: boolean
}

function ollamaHostForConfig(config: VisionConfig): string {
  return config.ollamaApiBase.trim() || resolveLocalLlmForConfig(config).ollamaHost
}

/**
 * Session start: only ensure the resolved fast/heavy route tags exist on disk.
 * No RAM preload (avoids fighting the session model load and 10% UI stalls).
 */
export function buildRouterRoutePullEntries(
  prefs: ModelRouterPrefs,
  sessionModel: string
): HopperPrepareEntry[] {
  const { fast, heavy } = resolveHopperModels(prefs.models, sessionModel)
  const entries: HopperPrepareEntry[] = []
  const seen = new Set<string>()
  for (const spec of [
    { tier: 'fast' as const, model: fast },
    { tier: 'heavy' as const, model: heavy },
  ]) {
    if (!spec.model) continue
    const tag = ollamaTagFromVisionModel(spec.model)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    entries.push({
      model_tag: tag,
      keep_alive_secs:
        spec.tier === 'fast' ? prefs.keepAliveFastSec : prefs.keepAliveHeavySec,
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
    const tag = ollamaTagFromVisionModel(
      row.model.trim() || (row.tier === 'heavy' ? sessionModel : '')
    )
    if (!tag) continue
    const preload = row.tier === 'fast' && !preloadedFast
    if (preload) preloadedFast = true
    entries.push({
      model_tag: tag,
      keep_alive_secs: row.tier === 'fast' ? prefs.keepAliveFastSec : prefs.keepAliveHeavySec,
      preload,
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

/** On Terminal → Start: pull fast/heavy route tags only (no preload). */
export async function prepareModelRouterForSessionStart(
  config: VisionConfig,
  prefs: ModelRouterPrefs
): Promise<string[]> {
  if (!isTauriRuntime() || !prefs.enabled || !isOllamaVisionModel(config.model)) {
    return []
  }
  return invokeHopperPrepare(config, buildRouterRoutePullEntries(prefs, config.model))
}

/** Pull all enabled hopper models + preload first fast (heavy; use from Settings later). */
export async function prepareModelRouterHopper(
  config: VisionConfig,
  prefs: ModelRouterPrefs
): Promise<string[]> {
  if (!isTauriRuntime() || !prefs.enabled || !isOllamaVisionModel(config.model)) {
    return []
  }
  return invokeHopperPrepare(config, buildHopperPrepareEntries(prefs, config.model))
}

export async function ensureRoutedOllamaModel(
  config: VisionConfig,
  prefs: ModelRouterPrefs,
  route: Pick<ModelRouteSnapshot, 'tier' | 'model'>
): Promise<OllamaEnsureModelResult | null> {
  if (!isTauriRuntime() || !prefs.enabled) return null
  const tag = ollamaTagFromVisionModel(route.model)
  if (!tag) return null
  const keepAlive =
    route.tier === 'fast' ? prefs.keepAliveFastSec : prefs.keepAliveHeavySec
  return invoke<OllamaEnsureModelResult>('ollama_ensure_model_loaded', {
    ollamaHost: ollamaHostForConfig(config),
    modelTag: tag,
    keepAliveSecs: keepAlive,
  })
}

export function resolvedRouterModels(prefs: ModelRouterPrefs, sessionModel: string) {
  return resolveHopperModels(prefs.models, sessionModel)
}
