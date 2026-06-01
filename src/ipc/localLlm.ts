import { DISPLAY_VISION_API } from '../brand'
import { DEFAULT_CONFIG, type VisionConfig } from './config'

export interface OllamaModelRow {
  name: string
  size?: string | null
  vram?: string | null
  expiresAt?: string | null
}

export interface OllamaModelsSnapshot {
  ollamaHost: string
  reachable: boolean
  configuredTag: string
  configuredInPs: boolean
  tagsText: string
  psText: string
  psRows?: OllamaModelRow[]
  tagsRows?: OllamaModelRow[]
}

export interface LocalLlmRuntimeStatus {
  ollamaRunning: boolean
  modelPulled: boolean
  modelLoaded: boolean
  ollamaHost: string
  modelTag: string
  logs: string[]
}

export interface LlmPingResult {
  ollamaReachable: boolean
  modelPulled: boolean
  modelLoaded: boolean
  generateOk: boolean
  latencyMs: number | null
  responsePreview: string | null
  coreReachable: boolean | null
  coreLatencyMs: number | null
  /** Connect/HTTP detail when Vision API health fails (desktop ping). */
  coreHealthError?: string | null
  error: string | null
  logs: string[]
}

/** MUI alert severity — Ollama-only success is warning when Vision API was probed but is down. */
export function llmPingAlertSeverity(
  r: LlmPingResult
): 'success' | 'warning' | 'error' {
  if (!r.generateOk) return 'error'
  if (r.coreReachable === false) return 'warning'
  return 'success'
}

export function llmPingNeedsSessionStart(r: LlmPingResult): boolean {
  return r.generateOk && r.coreReachable === false
}

export function formatLlmPingSummary(r: LlmPingResult): string {
  const parts: string[] = []
  if (r.generateOk && r.latencyMs != null) {
    parts.push(`LLM OK (${r.latencyMs}ms)`)
  } else if (r.ollamaReachable && r.modelPulled) {
    parts.push('LLM generate failed')
  } else if (!r.ollamaReachable) {
    parts.push('Ollama down')
  } else {
    parts.push('Model not ready')
  }
  if (r.coreReachable != null) {
    parts.push(
      r.coreReachable
        ? `${DISPLAY_VISION_API} OK${r.coreLatencyMs != null ? ` (${r.coreLatencyMs}ms)` : ''}`
        : `${DISPLAY_VISION_API} not running`
    )
  }
  return parts.join(' · ')
}

/** Hint when ping succeeds against Ollama but the Vision API HTTP server is down. */
export function formatLlmPingHint(r: LlmPingResult): string | null {
  if (!llmPingNeedsSessionStart(r)) return null
  const detail = r.coreHealthError?.trim()
  const base = `Ollama is ready. Ping does not start ${DISPLAY_VISION_API} — use Settings → Start ${DISPLAY_VISION_API} or Terminal → Start (full session) so :8741 is listening.`
  return detail ? `${base} (${detail})` : base
}

export interface LocalLlmSnapshot {
  sources: string[]
  ollamaHost: string | null
  dataModel: string | null
  llmMode: string | null
  /** Ollama tag for router fast tier (`FAST_MODEL`). */
  fastModel?: string | null
  /** Ollama tag for router heavy tier (`HEAVY_MODEL`; omit to use session LLM). */
  heavyModel?: string | null
  /** `MODEL_ROUTER=1` enables local model router when syncing env. */
  modelRouter?: boolean | null
  /** App path when `local-llm.env` exists at repo root or under `local-llm/`. */
  repoLocalLlmRoot?: string | null
}

/** Map an Ollama tag from `local-llm.env` to a LiteLLM model id for Vision. */
export function isOllamaVisionModel(model: string): boolean {
  const m = model.trim().toLowerCase()
  return m.startsWith('ollama_chat/') || m.startsWith('ollama/')
}

export function ollamaTagFromVisionModel(model: string): string | null {
  const m = model.trim()
  if (m.startsWith('ollama_chat/')) return m.slice('ollama_chat/'.length)
  if (m.startsWith('ollama/')) return m.slice('ollama/'.length)
  return null
}

export function resolveLocalLlmForConfig(cfg: VisionConfig): {
  ollamaHost: string
  modelTag: string | null
} {
  const host = cfg.ollamaApiBase.trim() || 'http://127.0.0.1:11434'
  const modelTag = ollamaTagFromVisionModel(cfg.model)
  return { ollamaHost: host, modelTag }
}

export function ollamaChatModelFromTag(tag: string): string {
  const t = tag.trim()
  if (!t) return DEFAULT_CONFIG.model
  if (t.includes('/')) return t
  return `ollama_chat/${t}`
}

function isDefaultOllamaModel(model: string): boolean {
  return model.trim() === DEFAULT_CONFIG.model
}

/**
 * Merge `local-llm.env` into Vision config.
 * `fillEmpty` — only set fields the user has not configured (recommended on startup).
 */
export function applyLocalLlmToConfig(
  cfg: VisionConfig,
  snap: LocalLlmSnapshot,
  fillEmpty: boolean
): VisionConfig {
  let next = cfg
  const host = snap.ollamaHost?.trim()
  if (host && (!fillEmpty || !cfg.ollamaApiBase.trim())) {
    next = { ...next, ollamaApiBase: host }
  }
  const tag = snap.dataModel?.trim()
  if (tag && (!fillEmpty || isDefaultOllamaModel(cfg.model))) {
    next = { ...next, model: ollamaChatModelFromTag(tag) }
  }
  return next
}

/** Short note when the on-disk filename is not `local-llm.env`. */
export function localLlmEnvFileNote(path: string): string | null {
  const base = path.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? path
  if (base === 'env') return 'filename: env (XDG / legacy local-llm)'
  return null
}

export function formatLocalLlmSources(snap: LocalLlmSnapshot): string {
  if (!snap.sources.length) return 'No local-llm config files found'
  return snap.sources.join('\n')
}

/** Settings panel: paths, load order, and merged keys from disk. */
export function formatLocalLlmEnvPanel(snap: LocalLlmSnapshot): string {
  if (!snap.sources.length) {
    return [
      'No env files found on disk.',
      '',
      'Recommended: cp local-llm.env.example → local-llm.env at the BrightVision repo root.',
      'Optional XDG: ~/.config/local-llm/env — the file is named env (no .env extension).',
    ].join('\n')
  }
  const lines = snap.sources.map((p, i) => {
    const note = localLlmEnvFileNote(p)
    return note ? `${i + 1}. ${p}\n   (${note})` : `${i + 1}. ${p}`
  })
  const winner = snap.sources[snap.sources.length - 1]!
  const effective: string[] = []
  if (snap.dataModel?.trim()) effective.push(`DATA_MODEL=${snap.dataModel.trim()}`)
  if (snap.ollamaHost?.trim()) effective.push(`OLLAMA_HOST=${snap.ollamaHost.trim()}`)
  if (snap.fastModel?.trim()) effective.push(`FAST_MODEL=${snap.fastModel.trim()}`)
  if (snap.heavyModel?.trim()) effective.push(`HEAVY_MODEL=${snap.heavyModel.trim()}`)
  if (snap.modelRouter != null) effective.push(`MODEL_ROUTER=${snap.modelRouter ? '1' : '0'}`)
  const parts = [
    'Read order — later files override earlier:',
    ...lines,
    '',
    `→ Values taken from: ${winner}`,
  ]
  if (effective.length) parts.push(`   ${effective.join(' · ')}`)
  return parts.join('\n')
}

export function formatLocalLlmDirectoryHelper(
  snap: LocalLlmSnapshot | null,
  localLlmRoot: string
): string {
  const override = localLlmRoot.trim()
  if (override) {
    return `Also reads ${override}/local-llm.env (applied last, overrides paths above).`
  }
  if (snap?.repoLocalLlmRoot) {
    return `Repo file: ${snap.repoLocalLlmRoot}/local-llm.env · XDG: ~/.config/local-llm/env (different filename).`
  }
  return 'Repo: ./local-llm.env (recommended). XDG: ~/.config/local-llm/env — file is named env, not local-llm.env.'
}
