/** A model in the router hopper (Settings pool). */

export type ModelHopperTier = 'fast' | 'heavy' | 'code' | 'think'

export interface ModelHopperEntry {
  id: string
  /** LiteLLM id, e.g. ollama_chat/deepseek-coder:6.7b. Empty on code rows uses session model. */
  model: string
  label?: string
  tier: ModelHopperTier
  enabled: boolean
  /** Per-model LiteLLM ``think``; ``undefined`` → tier default (think tier on, code/fast off). */
  enableThinking?: boolean | null
  /** LiteLLM kwargs JSON for this model when routed, e.g. ``{"top_p": 0.9}``. */
  extraParams?: string
}

export function normalizeHopperTier(raw: unknown): ModelHopperTier {
  if (raw === 'think') return 'think'
  if (raw === 'code' || raw === 'heavy') return 'code'
  return 'fast'
}

export function hopperTierLabel(tier: ModelHopperTier): string {
  if (tier === 'think') return 'Think'
  if (tier === 'code' || tier === 'heavy') return 'Code'
  return 'Fast'
}

export function hopperTierDefaultThinking(tier: ModelHopperTier): boolean {
  return normalizeHopperTier(tier) === 'think'
}

/** Resolved LiteLLM ``think`` for a hopper row (explicit override or tier default). */
export function resolveHopperEnableThinking(entry: ModelHopperEntry): boolean {
  if (entry.enableThinking === true) return true
  if (entry.enableThinking === false) return false
  return hopperTierDefaultThinking(entry.tier)
}

export function hopperExtraParamsError(raw: string | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return 'Must be a JSON object'
    }
    return null
  } catch {
    return 'Invalid JSON'
  }
}

/** Parsed hopper LiteLLM params for API; ``undefined`` when empty or invalid. */
export function parseHopperExtraParams(
  raw: string | undefined
): Record<string, unknown> | undefined {
  if (hopperExtraParamsError(raw)) return undefined
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return undefined
  return JSON.parse(trimmed) as Record<string, unknown>
}

export function newHopperEntryId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createHopperEntry(
  partial: Partial<ModelHopperEntry> & Pick<ModelHopperEntry, 'tier'>
): ModelHopperEntry {
  return {
    id: partial.id ?? newHopperEntryId(),
    model: partial.model ?? '',
    label: partial.label,
    tier: normalizeHopperTier(partial.tier),
    enabled: partial.enabled ?? false,
    enableThinking: partial.enableThinking,
    extraParams: partial.extraParams,
  }
}

export const DEFAULT_MODEL_HOPPER: ModelHopperEntry[] = [
  createHopperEntry({
    id: 'hopper-fast-deepseek',
    model: 'ollama_chat/deepseek-coder:6.7b',
    label: 'DeepSeek Coder 6.7B',
    tier: 'fast',
    enabled: false,
  }),
  createHopperEntry({
    id: 'hopper-code-main',
    model: '',
    label: 'Session model (code)',
    tier: 'code',
    enabled: true,
  }),
  createHopperEntry({
    id: 'hopper-think-r1',
    model: 'ollama_chat/deepseek-r1:32b',
    label: 'DeepSeek R1 32B',
    tier: 'think',
    enabled: false,
  }),
]

export function normalizeHopperEntries(raw: unknown): ModelHopperEntry[] {
  if (!Array.isArray(raw)) return [...DEFAULT_MODEL_HOPPER]
  const out: ModelHopperEntry[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Partial<ModelHopperEntry>
    const tier = normalizeHopperTier(row.tier)
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : newHopperEntryId()
    if (seen.has(id)) continue
    seen.add(id)
    const enableThinking =
      row.enableThinking === true
        ? true
        : row.enableThinking === false
          ? false
          : undefined
    out.push({
      id,
      model: typeof row.model === 'string' ? row.model : '',
      label: typeof row.label === 'string' ? row.label : undefined,
      tier,
      enabled: Boolean(row.enabled),
      enableThinking,
      extraParams: typeof row.extraParams === 'string' ? row.extraParams : undefined,
    })
  }
  return out.length > 0 ? out : [...DEFAULT_MODEL_HOPPER]
}

export interface ResolvedHopperModels {
  fast: string | null
  /** Code / implement tier (legacy name: heavy). */
  code: string
  /** Reasoning tier; null when no think slot enabled. */
  think: string | null
  /** @deprecated Use `code`. */
  heavy: string
}

/** First enabled entry per tier (list order = priority). */
export function resolveHopperModels(
  models: ModelHopperEntry[],
  sessionModel: string
): ResolvedHopperModels {
  const fast =
    models.find((m) => m.enabled && m.tier === 'fast' && m.model.trim())?.model.trim() ?? null
  const codeRow = models.find(
    (m) => m.enabled && (m.tier === 'code' || m.tier === 'heavy')
  )
  const code = codeRow?.model.trim() ? codeRow.model.trim() : sessionModel
  const think =
    models.find((m) => m.enabled && m.tier === 'think' && m.model.trim())?.model.trim() ?? null
  return { fast, code, think, heavy: code }
}

export function migrateLegacyRouterModels(parsed: {
  fastModel?: string
  heavyModel?: string
  thinkModel?: string
  models?: unknown
}): ModelHopperEntry[] {
  if (Array.isArray(parsed.models) && parsed.models.length > 0) {
    return normalizeHopperEntries(parsed.models)
  }
  const hopper = [...DEFAULT_MODEL_HOPPER]
  const fast = parsed.fastModel?.trim()
  const heavy = parsed.heavyModel?.trim()
  const think = parsed.thinkModel?.trim()
  if (fast) {
    const existing = hopper.find((m) => m.tier === 'fast')
    if (existing) {
      existing.model = fast
      existing.enabled = true
    } else {
      hopper.unshift(
        createHopperEntry({ model: fast, tier: 'fast', enabled: true, label: 'Migrated fast' })
      )
    }
  }
  if (heavy) {
    const codeRow = hopper.find((m) => m.tier === 'code' || m.tier === 'heavy')
    if (codeRow) {
      codeRow.model = heavy
      codeRow.tier = 'code'
      codeRow.enabled = true
      codeRow.label = codeRow.label ?? 'Migrated code'
    }
  }
  if (think) {
    const thinkRow = hopper.find((m) => m.tier === 'think')
    if (thinkRow) {
      thinkRow.model = think
      thinkRow.enabled = true
      thinkRow.label = thinkRow.label ?? 'Migrated think'
    } else {
      hopper.push(
        createHopperEntry({ model: think, tier: 'think', enabled: true, label: 'Migrated think' })
      )
    }
  }
  return hopper
}

export function moveHopperEntry(
  models: ModelHopperEntry[],
  id: string,
  direction: -1 | 1
): ModelHopperEntry[] {
  const idx = models.findIndex((m) => m.id === id)
  if (idx < 0) return models
  const next = idx + direction
  if (next < 0 || next >= models.length) return models
  const copy = [...models]
  const [row] = copy.splice(idx, 1)
  copy.splice(next, 0, row)
  return copy
}

export function updateHopperEntry(
  models: ModelHopperEntry[],
  id: string,
  patch: Partial<ModelHopperEntry>
): ModelHopperEntry[] {
  return models.map((m) =>
    m.id === id ? { ...m, ...patch, id: m.id, tier: patch.tier ? normalizeHopperTier(patch.tier) : m.tier } : m
  )
}

export function removeHopperEntry(models: ModelHopperEntry[], id: string): ModelHopperEntry[] {
  const next = models.filter((m) => m.id !== id)
  return next.length > 0 ? next : [...DEFAULT_MODEL_HOPPER]
}

/** Point the enabled code slot at the session LLM model (or add one). */
export function syncSessionModelToHopper(
  models: ModelHopperEntry[],
  sessionModel: string
): ModelHopperEntry[] {
  const trimmed = sessionModel.trim()
  const label = trimmed ? `Session model (${trimmed})` : 'Session model (code)'
  const codeIdx = models.findIndex((m) => m.tier === 'code' || m.tier === 'heavy')
  if (codeIdx >= 0) {
    return models.map((m, i) =>
      i === codeIdx ? { ...m, tier: 'code', model: '', label, enabled: true } : m
    )
  }
  return [
    ...models,
    createHopperEntry({
      tier: 'code',
      model: '',
      label,
      enabled: true,
    }),
  ]
}
