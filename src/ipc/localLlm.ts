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
  error: string | null
  logs: string[]
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
        ? `Core OK${r.coreLatencyMs != null ? ` (${r.coreLatencyMs}ms)` : ''}`
        : 'Core not running'
    )
  }
  return parts.join(' · ')
}

/** Hint when ping succeeds against Ollama but Vision Core HTTP is down. */
export function formatLlmPingHint(r: LlmPingResult): string | null {
  if (!r.generateOk || r.coreReachable !== false) return null
  return 'Ollama inference works. Start the coding session (Terminal → Start) to run Vision Core on :8741.'
}

export interface LocalLlmSnapshot {
  sources: string[]
  ollamaHost: string | null
  dataModel: string | null
  llmMode: string | null
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

export function formatLocalLlmSources(snap: LocalLlmSnapshot): string {
  if (!snap.sources.length) return 'No local-llm config files found'
  return snap.sources.join('\n')
}
