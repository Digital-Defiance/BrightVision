/** A model in the router hopper (Settings pool). */

export type ModelHopperTier = 'fast' | 'heavy'

export interface ModelHopperEntry {
  id: string
  /** LiteLLM id, e.g. ollama_chat/deepseek-coder:6.7b. Empty on heavy rows uses session model. */
  model: string
  label?: string
  tier: ModelHopperTier
  enabled: boolean
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
    tier: partial.tier,
    enabled: partial.enabled ?? false,
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
    id: 'hopper-fast-qwen',
    model: 'ollama_chat/qwen2.5-coder:7b',
    label: 'Qwen2.5 Coder 7B',
    tier: 'fast',
    enabled: false,
  }),
  createHopperEntry({
    id: 'hopper-heavy-main',
    model: '',
    label: 'Session model (LLM field above)',
    tier: 'heavy',
    enabled: true,
  }),
]

export function normalizeHopperEntries(raw: unknown): ModelHopperEntry[] {
  if (!Array.isArray(raw)) return [...DEFAULT_MODEL_HOPPER]
  const out: ModelHopperEntry[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Partial<ModelHopperEntry>
    const tier = row.tier === 'heavy' ? 'heavy' : 'fast'
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : newHopperEntryId()
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      model: typeof row.model === 'string' ? row.model : '',
      label: typeof row.label === 'string' ? row.label : undefined,
      tier,
      enabled: Boolean(row.enabled),
    })
  }
  return out.length > 0 ? out : [...DEFAULT_MODEL_HOPPER]
}

/** First enabled entry per tier (list order = priority). */
export function resolveHopperModels(
  models: ModelHopperEntry[],
  sessionModel: string
): { fast: string | null; heavy: string } {
  const fast =
    models.find((m) => m.enabled && m.tier === 'fast' && m.model.trim())?.model.trim() ?? null
  const heavyRow = models.find((m) => m.enabled && m.tier === 'heavy')
  const heavy = heavyRow?.model.trim() ? heavyRow.model.trim() : sessionModel
  return { fast, heavy }
}

export function migrateLegacyRouterModels(parsed: {
  fastModel?: string
  heavyModel?: string
  models?: unknown
}): ModelHopperEntry[] {
  if (Array.isArray(parsed.models) && parsed.models.length > 0) {
    return normalizeHopperEntries(parsed.models)
  }
  const hopper = [...DEFAULT_MODEL_HOPPER]
  const fast = parsed.fastModel?.trim()
  const heavy = parsed.heavyModel?.trim()
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
    const heavyRow = hopper.find((m) => m.tier === 'heavy')
    if (heavyRow) {
      heavyRow.model = heavy
      heavyRow.enabled = true
      heavyRow.label = heavyRow.label ?? 'Migrated heavy'
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
  return models.map((m) => (m.id === id ? { ...m, ...patch, id: m.id } : m))
}

export function removeHopperEntry(models: ModelHopperEntry[], id: string): ModelHopperEntry[] {
  const next = models.filter((m) => m.id !== id)
  return next.length > 0 ? next : [...DEFAULT_MODEL_HOPPER]
}

/** Point the enabled heavy slot at the session LLM model (or add one). */
export function syncSessionModelToHopper(
  models: ModelHopperEntry[],
  sessionModel: string
): ModelHopperEntry[] {
  const trimmed = sessionModel.trim()
  const label = trimmed
    ? `Session model (${trimmed})`
    : 'Session model (LLM field)'
  const heavyIdx = models.findIndex((m) => m.tier === 'heavy')
  if (heavyIdx >= 0) {
    return models.map((m, i) =>
      i === heavyIdx ? { ...m, model: '', label, enabled: true } : m
    )
  }
  return [
    ...models,
    createHopperEntry({
      tier: 'heavy',
      model: '',
      label,
      enabled: true,
    }),
  ]
}
