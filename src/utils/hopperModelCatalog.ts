import type { LocalLlmSnapshot, OllamaModelRow, OllamaModelsSnapshot, TierSlotEntry } from '../ipc/localLlm'
import { localModelTagFromVisionModel, ollamaChatModelFromTag } from '../ipc/localLlm'
import {
  createHopperEntry,
  normalizeHopperTier,
  type ModelHopperEntry,
  type ModelHopperTier,
} from '../theme/modelHopper'

export type ModelPickKind = 'catalog' | 'env' | 'custom' | 'session-code'

export interface ModelPickOption {
  kind: ModelPickKind
  value: string
  label: string
  detail?: string
  tier: ModelHopperTier
  tag?: string
  model?: string
  envKey?: string
  maxContext?: number
  tierSlot?: number
  enableThinking?: boolean | null
  vision?: boolean | null
}

export function backendLabel(backend: string | null | undefined): string {
  const name = (backend ?? 'ollama').trim().toLowerCase()
  if (name === 'lmstudio') return 'LM Studio (lms ls)'
  if (name === 'ollama') return 'Ollama'
  if (name === 'vllm') return 'vLLM'
  if (name === 'llamacpp') return 'llama.cpp'
  return name
}

export function normalizeHopperModelId(model: string): string {
  const trimmed = model.trim().toLowerCase()
  const tag = localModelTagFromVisionModel(trimmed)
  return (tag ?? trimmed).toLowerCase()
}

export function isHopperModelTaken(existing: readonly string[], candidateModel: string): boolean {
  const key = normalizeHopperModelId(candidateModel)
  if (!key) return false
  return existing.some((m) => normalizeHopperModelId(m) === key)
}

export function tierSlotEnvKey(tier: ModelHopperTier, slot: number): string {
  const base =
    tier === 'think' ? 'THINK_MODEL' : tier === 'code' || tier === 'heavy' ? 'CODE_MODEL' : 'FAST_MODEL'
  return slot <= 0 ? base : `${base}_${slot}`
}

function envOptionsForTier(
  snap: LocalLlmSnapshot | null | undefined,
  tier: ModelHopperTier,
  backend: string,
  existingModels: readonly string[]
): ModelPickOption[] {
  if (!snap) return []
  const normalizedTier = normalizeHopperTier(tier)
  const out: ModelPickOption[] = []
  const seen = new Set<string>()

  const pushSlot = (slot: TierSlotEntry) => {
    if (normalizeHopperTier(slot.tier) !== normalizedTier) return
    const tag = slot.modelTag.trim()
    if (!tag) return
    const model = ollamaChatModelFromTag(tag, backend)
    if (isHopperModelTaken(existingModels, model)) return
    const envKey = tierSlotEnvKey(normalizedTier, slot.slot)
    const value = `env:${envKey}:${tag}`
    if (seen.has(value)) return
    seen.add(value)
    out.push({
      kind: 'env',
      value,
      label: tag,
      detail: envKey,
      tier: normalizedTier,
      tag,
      model,
      envKey,
      maxContext: slot.maxContext ?? undefined,
      tierSlot: slot.slot,
      enableThinking: slot.enableThinking,
      vision: slot.vision,
    })
  }

  for (const slot of snap.tierSlots ?? []) pushSlot(slot)

  const legacy: Array<[ModelHopperTier, string | null | undefined, string]> = [
    ['fast', snap.fastModel, 'FAST_MODEL'],
    ['code', snap.codeModel ?? snap.heavyModel, snap.codeModel?.trim() ? 'CODE_MODEL' : 'HEAVY_MODEL'],
    ['think', snap.thinkModel, 'THINK_MODEL'],
  ]
  for (const [legacyTier, tagRaw, envKey] of legacy) {
    if (normalizeHopperTier(legacyTier) !== normalizedTier) continue
    const tag = tagRaw?.trim()
    if (!tag) continue
    const model = ollamaChatModelFromTag(tag, backend)
    if (isHopperModelTaken(existingModels, model)) continue
    const value = `env:${envKey}:${tag}`
    if (seen.has(value)) continue
    seen.add(value)
    out.push({
      kind: 'env',
      value,
      label: tag,
      detail: envKey,
      tier: normalizedTier,
      tag,
      model,
      envKey,
    })
  }

  return out
}

export function catalogRowsFromSnapshot(
  snapshot: OllamaModelsSnapshot | null | undefined
): OllamaModelRow[] {
  return snapshot?.tagsRows?.filter((row) => row.name.trim()) ?? []
}

export function buildModelPickOptions(input: {
  tier: ModelHopperTier
  snapshot?: OllamaModelsSnapshot | null
  localLlmSnap?: LocalLlmSnapshot | null
  existingModels: readonly string[]
  includeSessionCode?: boolean
}): ModelPickOption[] {
  const normalizedTier = normalizeHopperTier(input.tier)
  const backend = input.snapshot?.backend ?? input.localLlmSnap?.backend ?? 'ollama'
  const out: ModelPickOption[] = []

  for (const row of catalogRowsFromSnapshot(input.snapshot)) {
    const tag = row.name.trim()
    const model = ollamaChatModelFromTag(tag, backend)
    if (isHopperModelTaken(input.existingModels, model)) continue
    out.push({
      kind: 'catalog',
      value: `catalog:${tag}`,
      label: tag,
      detail: row.context ? `${row.context} ctx` : undefined,
      tier: normalizedTier,
      tag,
      model,
      maxContext: row.context ?? undefined,
    })
  }

  out.push(...envOptionsForTier(input.localLlmSnap, normalizedTier, backend, input.existingModels))

  if (input.includeSessionCode && normalizedTier === 'code') {
    out.push({
      kind: 'session-code',
      value: 'session-code',
      label: 'Session model (uses LLM model field)',
      detail: 'Empty model id',
      tier: 'code',
      model: '',
    })
  }

  out.push({
    kind: 'custom',
    value: 'custom',
    label: 'Custom — type model id manually',
    tier: normalizedTier,
    model: '',
  })

  return out
}

export function hopperEntryFromPick(option: ModelPickOption, enabled = false): ModelHopperEntry {
  if (option.kind === 'session-code') {
    return createHopperEntry({
      tier: 'code',
      model: '',
      label: 'Session model (code)',
      enabled,
    })
  }

  if (option.kind === 'custom') {
    return createHopperEntry({
      tier: option.tier,
      model: '',
      label: `New ${option.tier} model`,
      enabled,
    })
  }

  const model = option.model ?? (option.tag ? ollamaChatModelFromTag(option.tag) : '')
  const capabilities =
    option.maxContext || option.vision
      ? {
          maxContext: option.maxContext && option.maxContext > 0 ? option.maxContext : undefined,
          vision: option.vision === true ? true : undefined,
        }
      : undefined

  return createHopperEntry({
    tier: option.tier,
    model,
    label: option.tag ?? option.label,
    enabled,
    tierSlot: option.tierSlot,
    enableThinking: option.enableThinking ?? undefined,
    capabilities,
  })
}

export function findModelPickOption(
  options: readonly ModelPickOption[],
  value: string
): ModelPickOption | undefined {
  return options.find((o) => o.value === value)
}
