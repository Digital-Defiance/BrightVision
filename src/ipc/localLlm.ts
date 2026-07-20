import { DISPLAY_VISION_API } from '../brand'
import { DEFAULT_CONFIG, type VisionConfig } from './config'

export interface OllamaModelRow {
  name: string
  size?: string | null
  vram?: string | null
  expiresAt?: string | null
  processor?: string | null
  context?: number | null
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
  /** Active local LLM backend from Rust (`ollama`, `lmstudio`, …). */
  backend?: string
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

/** A numbered tier slot binding a model to a tier position (from Rust `TierSlotEntry`). */
export interface TierSlotEntry {
  /** Tier label: "fast", "code", or "think". */
  tier: 'fast' | 'code' | 'think'
  /** Slot number: 0 = base key, 1–9 = numbered env vars. */
  slot: number
  /** Ollama model tag (e.g. `qwen2.5-coder:7b`). */
  modelTag: string
  /** Whether this model supports vision/multimodal input (from `*_VISION=1` env). */
  vision?: boolean | null
  /** Max context window in tokens (from `*_MAX_CONTEXT=N` env). */
  maxContext?: number | null
  /** Per-slot LiteLLM think mode (from `*_THINK=0|1` env). Overrides tier-level CODE_THINK/FAST_THINK. */
  enableThinking?: boolean | null
}

export interface LocalLlmSnapshot {
  sources: string[]
  ollamaHost: string | null
  dataModel: string | null
  llmMode: string | null
  /** Ollama tag for router fast tier (`FAST_MODEL`). */
  fastModel?: string | null
  /** Ollama tag for router code tier (`CODE_MODEL` or legacy `HEAVY_MODEL`). */
  codeModel?: string | null
  /** @deprecated Use `codeModel`. */
  heavyModel?: string | null
  /** Ollama tag for router think/reasoning tier (`THINK_MODEL`). */
  thinkModel?: string | null
  /** `MODEL_ROUTER=1` enables local model router when syncing env. */
  modelRouter?: boolean | null
  /** `FAST_THINK=0|1` → hopper fast tier LiteLLM think (optional). */
  fastThink?: boolean | null
  /** `CODE_THINK=0|1` → hopper code tier LiteLLM think (optional). */
  codeThink?: boolean | null
  /** App path when `local-llm.env` exists at repo root or under `local-llm/`. */
  repoLocalLlmRoot?: string | null
  /** Multi-model tier slots parsed from env (base keys as slot 0, numbered as 1–9). */
  tierSlots?: TierSlotEntry[]
  /** Resolved priority list from `MODEL_PRIORITY` or derived default (model tags in priority order). */
  priorityList?: string[]
  /** Raw `MODEL_PRIORITY` env value (null when not set). */
  modelPriorityRaw?: string | null
  /** Warnings generated during parsing (e.g. unresolved tier labels in MODEL_PRIORITY). */
  warnings?: string[]
  /** When true, prefer already-loaded models over cold-starting the highest-priority one. */
  preferWarm?: boolean | null
  /** Active local LLM backend from Rust config resolver (defaults to `ollama`). */
  backend?: string
  /** Derived UI capabilities; optional when computed client-side from `backend`. */
  capabilities?: BackendCapabilities
}

/** Lifecycle features exposed by the active local LLM backend. */
export interface BackendCapabilities {
  supportsVramQuery: boolean
  supportsModelPull: boolean
  supportsContextWindowQuery: boolean
}

const OLLAMA_CAPABILITIES: BackendCapabilities = {
  supportsVramQuery: true,
  supportsModelPull: true,
  supportsContextWindowQuery: true,
}

const EXTERNAL_BACKEND_CAPABILITIES: BackendCapabilities = {
  supportsVramQuery: false,
  supportsModelPull: false,
  supportsContextWindowQuery: false,
}

const LMSTUDIO_CAPABILITIES: BackendCapabilities = {
  supportsVramQuery: false,
  supportsModelPull: false,
  supportsContextWindowQuery: true,
}

/** Map backend name → UI capabilities (REQ-004). */
export function capabilitiesForBackend(backend: string | null | undefined): BackendCapabilities {
  const name = (backend ?? 'ollama').trim().toLowerCase()
  if (name === 'ollama') return OLLAMA_CAPABILITIES
  if (name === 'lmstudio') return LMSTUDIO_CAPABILITIES
  return EXTERNAL_BACKEND_CAPABILITIES
}

/** Strip LiteLLM provider prefix → bare local model id (Ollama tag or LM Studio modelKey). */
export function localModelTagFromVisionModel(model: string): string | null {
  const m = model.trim()
  if (m.startsWith('ollama_chat/')) return m.slice('ollama_chat/'.length)
  if (m.startsWith('ollama/')) return m.slice('ollama/'.length)
  if (m.startsWith('openai/')) return m.slice('openai/'.length)
  return null
}

/** Map a local model id from env to a LiteLLM model id for the active backend. */
export function visionModelFromLocalTag(tag: string, backend?: string | null): string {
  const t = tag.trim()
  if (!t) return DEFAULT_CONFIG.model
  if (t.startsWith('ollama_chat/') || t.startsWith('ollama/') || t.startsWith('openai/')) {
    return t
  }
  const name = (backend ?? 'ollama').trim().toLowerCase()
  if (name === 'ollama') return `ollama_chat/${t}`
  if (name === 'lmstudio' || name === 'vllm' || name === 'tgi' || name === 'llamacpp' || name === 'mlx-lm') {
    return `openai/${t}`
  }
  return `ollama_chat/${t}`
}

export function localLlmListLabels(backend?: string | null): {
  statusTitle: string
  tagsTitle: string
  psTitle: string
  tagsHost: string
  psHost: string
  tagsEmpty: string
  psEmpty: string
  configuredInPs: string
  configuredNotInPs: string
  unreachable: string
  loadedChipYes: string
  loadedChipNo: string
} {
  const name = (backend ?? 'ollama').trim().toLowerCase()
  if (name === 'lmstudio') {
    return {
      statusTitle: 'LM Studio status',
      tagsTitle: 'lms ls — models on disk',
      psTitle: 'lms ps — loaded in RAM',
      tagsHost: 'lms ls --json',
      psHost: 'lms ps --json',
      tagsEmpty: 'No models on disk (download in LM Studio or run lms get)',
      psEmpty: 'No models loaded (run lms load or Local LLM → Start)',
      configuredInPs: 'in lms ps',
      configuredNotInPs: 'not in lms ps',
      unreachable:
        'LM Studio CLI not reachable. Install lms and ensure it is on PATH.',
      loadedChipYes: 'In lms ps',
      loadedChipNo: 'Not in lms ps',
    }
  }
  return {
    statusTitle: 'Ollama status',
    tagsTitle: '/api/tags — pulled models',
    psTitle: '/api/ps — loaded in RAM',
    tagsHost: 'GET /api/tags',
    psHost: 'GET /api/ps',
    tagsEmpty: 'No models in /api/tags (run ollama pull or Local LLM → Start)',
    psEmpty: 'No models in /api/ps (empty — model may have unloaded; use Local LLM → Start)',
    configuredInPs: 'in /api/ps',
    configuredNotInPs: 'not in /api/ps',
    unreachable: 'Ollama not reachable. Start Ollama or check Settings → Ollama API base.',
    loadedChipYes: 'In /api/ps',
    loadedChipNo: 'Not in /api/ps',
  }
}

/** True when Settings model matches the active local backend provider prefix. */
export function isLocalBackendVisionModel(model: string, backend?: string | null): boolean {
  const m = model.trim().toLowerCase()
  const name = (backend ?? 'ollama').trim().toLowerCase()
  if (name === 'lmstudio') {
    return m.startsWith('openai/')
  }
  return isOllamaVisionModel(model)
}

export function isOllamaVisionModel(model: string): boolean {
  const m = model.trim().toLowerCase()
  return m.startsWith('ollama_chat/') || m.startsWith('ollama/')
}

/** @deprecated Use {@link localModelTagFromVisionModel}. */
export function ollamaTagFromVisionModel(model: string): string | null {
  return localModelTagFromVisionModel(model)
}

/** Strip provider prefix for row matching against backend listings. */
export function bareLocalModelId(model: string): string {
  return localModelTagFromVisionModel(model) ?? model.trim()
}

export function resolveLocalLlmForConfig(
  cfg: VisionConfig,
  backend?: string | null
): {
  ollamaHost: string
  modelTag: string | null
} {
  const name = (backend ?? 'ollama').trim().toLowerCase()
  const defaultHost =
    name === 'lmstudio' ? 'http://127.0.0.1:1234' : 'http://127.0.0.1:11434'
  const host = cfg.ollamaApiBase.trim() || defaultHost
  const modelTag = localModelTagFromVisionModel(cfg.model)
  return { ollamaHost: host, modelTag }
}

export function ollamaChatModelFromTag(tag: string, backend?: string | null): string {
  return visionModelFromLocalTag(tag, backend ?? 'ollama')
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
    next = { ...next, model: visionModelFromLocalTag(tag, snap.backend) }
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
  const codeTag = snap.codeModel?.trim() || snap.heavyModel?.trim()
  if (codeTag) effective.push(`CODE_MODEL=${codeTag}`)
  if (snap.thinkModel?.trim()) effective.push(`THINK_MODEL=${snap.thinkModel.trim()}`)
  if (snap.modelRouter != null) effective.push(`MODEL_ROUTER=${snap.modelRouter ? '1' : '0'}`)
  if (snap.fastThink != null) effective.push(`FAST_THINK=${snap.fastThink ? '1' : '0'}`)
  if (snap.codeThink != null) effective.push(`CODE_THINK=${snap.codeThink ? '1' : '0'}`)
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
