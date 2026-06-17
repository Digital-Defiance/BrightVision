import type { LocalLlmSnapshot, TierSlotEntry } from '../ipc/localLlm'
import { ollamaChatModelFromTag } from '../ipc/localLlm'

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
  /** Priority rank (0 = highest). Derived from MODEL_PRIORITY or hopper list order. */
  priorityRank?: number
  /** Slot number within the tier (0 = base key, 1-9 = numbered env var). */
  tierSlot?: number
  /** Model capabilities: vision, max_context, specializations. */
  capabilities?: ModelCapabilities
}

/** Capability flags for a model in the hopper. */
export interface ModelCapabilities {
  /** Model supports multimodal/vision input (images). */
  vision?: boolean
  /** Max context window size in tokens. */
  maxContext?: number
  /** Free-form specialization tags (e.g. "refactoring", "tests"). */
  tags?: string[]
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

/** True when the first enabled think entry appears before the first enabled code entry (user priority). */
export function hopperPrefersThink(models: ModelHopperEntry[]): boolean {
  let thinkIdx: number | null = null
  let codeIdx: number | null = null
  for (let i = 0; i < models.length; i++) {
    const m = models[i]
    if (!m.enabled) continue
    if (m.tier === 'think' && m.model.trim() && thinkIdx === null) thinkIdx = i
    if ((m.tier === 'code' || m.tier === 'heavy') && codeIdx === null) codeIdx = i
  }
  if (thinkIdx === null || codeIdx === null) return false
  return thinkIdx < codeIdx
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

/**
 * Build hopper entries from a multi-model LocalLlmSnapshot (Sync from env).
 *
 * Creates one `ModelHopperEntry` per tier slot, assigns `priorityRank` based on
 * position in `priorityList`, and returns the entries sorted by priority rank
 * (ascending, entries not in the priority list go to the end).
 */
export function buildHopperFromSnapshot(
  snap: LocalLlmSnapshot,
  _sessionModel: string
): ModelHopperEntry[] {
  const tierSlots: TierSlotEntry[] = snap.tierSlots ?? []
  const priorityList: string[] = snap.priorityList ?? []

  const entries: ModelHopperEntry[] = tierSlots.map((slot) => {
    const priorityIdx = priorityList.indexOf(slot.modelTag)
    const liteLlmModel = slot.modelTag.trim()
      ? ollamaChatModelFromTag(slot.modelTag, snap.backend)
      : ''
    // Build capabilities from env-declared vision/maxContext
    const capabilities: ModelCapabilities | undefined =
      (slot.vision || slot.maxContext)
        ? {
            vision: slot.vision === true ? true : undefined,
            maxContext: (slot.maxContext && slot.maxContext > 0) ? slot.maxContext : undefined,
          }
        : undefined
    // Per-slot think from env (CODE_MODEL_1_THINK=1 etc.)
    const enableThinking: boolean | undefined =
      slot.enableThinking === true
        ? true
        : slot.enableThinking === false
          ? false
          : undefined
    return {
      id: `${slot.tier}-${slot.slot}-${newHopperEntryId()}`,
      model: liteLlmModel,
      label: slot.modelTag,
      tier: normalizeHopperTier(slot.tier),
      enabled: true,
      enableThinking,
      priorityRank: priorityIdx >= 0 ? priorityIdx : undefined,
      tierSlot: slot.slot,
      capabilities,
    }
  })

  // Sort by priorityRank ascending; entries without a rank go to the end.
  entries.sort((a, b) => {
    const aRank = a.priorityRank ?? Number.MAX_SAFE_INTEGER
    const bRank = b.priorityRank ?? Number.MAX_SAFE_INTEGER
    return aRank - bRank
  })

  return entries
}

/** Strip the `ollama_chat/` prefix from a LiteLLM model id to get the raw Ollama tag. */
function stripOllamaChatPrefix(model: string): string {
  return model.startsWith('ollama_chat/') ? model.slice('ollama_chat/'.length) : model
}

/** Canonical tier ordering for reassembly. */
const TIER_ORDER: ModelHopperTier[] = ['fast', 'code', 'think']

/**
 * Reorder entries within each tier to match a given priority list.
 * Models earlier in the priority list appear first within their tier group.
 * Entries not found in the priority list are placed at the end of their tier group.
 * Returns a new array with updated `priorityRank` values; does NOT mutate the input.
 */
export function applyPriorityOrder(
  entries: ModelHopperEntry[],
  priorityList: string[]
): ModelHopperEntry[] {
  // Build a lookup: raw tag → index in priorityList
  const priorityIndex = new Map<string, number>()
  for (let i = 0; i < priorityList.length; i++) {
    priorityIndex.set(priorityList[i], i)
  }

  // Group entries by tier (preserve relative input order as a tiebreaker)
  const groups = new Map<ModelHopperTier, ModelHopperEntry[]>()
  for (const tier of TIER_ORDER) {
    groups.set(tier, [])
  }
  for (const entry of entries) {
    const tier = normalizeHopperTier(entry.tier)
    const group = groups.get(tier)
    if (group) {
      group.push(entry)
    } else {
      // Shouldn't happen, but handle gracefully
      groups.set(tier, [entry])
    }
  }

  // Sort within each tier by priority list position
  for (const [, group] of groups) {
    group.sort((a, b) => {
      const tagA = stripOllamaChatPrefix(a.model)
      const tagB = stripOllamaChatPrefix(b.model)
      const idxA = priorityIndex.has(tagA) ? priorityIndex.get(tagA)! : Infinity
      const idxB = priorityIndex.has(tagB) ? priorityIndex.get(tagB)! : Infinity
      return idxA - idxB
    })
  }

  // Reassemble in tier order and assign priorityRank
  const result: ModelHopperEntry[] = []
  let rank = 0
  for (const tier of TIER_ORDER) {
    const group = groups.get(tier) ?? []
    for (const entry of group) {
      result.push({ ...entry, priorityRank: rank })
      rank++
    }
  }

  return result
}

/**
 * Reassign `priorityRank` values based on visual position within the full entries list.
 * After a user reorders within a tier, call this with the updated entries list so that
 * topmost entry = rank 0, next = rank 1, etc. This makes UI order authoritative
 * over any env-derived priority (Req 6.3, 6.4).
 */
export function reassignPriorityRanks(entries: ModelHopperEntry[]): ModelHopperEntry[] {
  return entries.map((entry, idx) => ({ ...entry, priorityRank: idx }))
}

/**
 * Replace entries for a specific tier with reordered entries, preserving other tiers.
 * Returns the full updated entries array with `priorityRank` reassigned across all entries.
 */
export function reorderWithinTier(
  allEntries: ModelHopperEntry[],
  tier: ModelHopperTier,
  reorderedTierEntries: ModelHopperEntry[]
): ModelHopperEntry[] {
  const normalizedTarget = normalizeHopperTier(tier)
  // Replace entries for the target tier with the reordered ones, keeping other tiers in place
  const result: ModelHopperEntry[] = []
  let tierInsertDone = false
  for (const entry of allEntries) {
    if (normalizeHopperTier(entry.tier) === normalizedTarget) {
      // Insert the full reordered tier group at the position of the first tier entry
      if (!tierInsertDone) {
        result.push(...reorderedTierEntries)
        tierInsertDone = true
      }
      // Skip original tier entries (replaced by reorderedTierEntries)
    } else {
      result.push(entry)
    }
  }
  // Edge case: if the tier didn't previously exist but reorderedTierEntries has entries
  if (!tierInsertDone && reorderedTierEntries.length > 0) {
    result.push(...reorderedTierEntries)
  }
  return reassignPriorityRanks(result)
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
