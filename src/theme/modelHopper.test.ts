import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODEL_HOPPER,
  applyPriorityOrder,
  createHopperEntry,
  hopperExtraParamsError,
  migrateLegacyRouterModels,
  parseHopperExtraParams,
  reassignPriorityRanks,
  reorderWithinTier,
  resolveHopperEnableThinking,
  resolveHopperModels,
  type ModelHopperEntry,
} from './modelHopper'

describe('modelHopper', () => {
  it('resolves first enabled fast and code', () => {
    const models = [
      { ...DEFAULT_MODEL_HOPPER[0], enabled: false },
      {
        id: 'b',
        model: 'ollama_chat/fast-b',
        tier: 'fast' as const,
        enabled: true,
      },
      {
        id: 'c',
        model: 'ollama_chat/code-c',
        tier: 'code' as const,
        enabled: true,
      },
    ]
    expect(resolveHopperModels(models, 'ollama_chat/session')).toEqual({
      fast: 'ollama_chat/fast-b',
      code: 'ollama_chat/code-c',
      think: null,
      heavy: 'ollama_chat/code-c',
    })
  })

  it('code row with empty model uses session', () => {
    const models = [
      {
        id: 'f',
        model: 'ollama_chat/fast',
        tier: 'fast' as const,
        enabled: true,
      },
      {
        id: 'h',
        model: '',
        tier: 'code' as const,
        enabled: true,
      },
    ]
    expect(resolveHopperModels(models, 'ollama_chat/big')).toEqual({
      fast: 'ollama_chat/fast',
      code: 'ollama_chat/big',
      think: null,
      heavy: 'ollama_chat/big',
    })
  })

  it('migrates legacy fastModel and heavyModel', () => {
    const hopper = migrateLegacyRouterModels({
      fastModel: 'ollama_chat/legacy-fast',
      heavyModel: 'ollama_chat/legacy-code',
      thinkModel: 'ollama_chat/legacy-think',
    })
    const enabledFast = hopper.find((m) => m.tier === 'fast' && m.enabled)
    const enabledCode = hopper.find((m) => m.tier === 'code' && m.enabled)
    const enabledThink = hopper.find((m) => m.tier === 'think' && m.enabled)
    expect(enabledFast?.model).toBe('ollama_chat/legacy-fast')
    expect(enabledCode?.model).toBe('ollama_chat/legacy-code')
    expect(enabledThink?.model).toBe('ollama_chat/legacy-think')
  })

  it('resolveHopperEnableThinking uses tier default or explicit override', () => {
    expect(
      resolveHopperEnableThinking(createHopperEntry({ tier: 'think', model: 'ollama_chat/r1' }))
    ).toBe(true)
    expect(
      resolveHopperEnableThinking(createHopperEntry({ tier: 'code', model: 'ollama_chat/qwen' }))
    ).toBe(false)
    expect(
      resolveHopperEnableThinking(
        createHopperEntry({
          tier: 'code',
          model: 'ollama_chat/r1',
          enableThinking: true,
        })
      )
    ).toBe(true)
  })

  it('parseHopperExtraParams validates JSON object', () => {
    expect(parseHopperExtraParams('')).toBeUndefined()
    expect(parseHopperExtraParams('{"top_p": 0.9}')).toEqual({ top_p: 0.9 })
    expect(hopperExtraParamsError('not json')).toBe('Invalid JSON')
    expect(hopperExtraParamsError('[]')).toBe('Must be a JSON object')
  })
})

describe('applyPriorityOrder', () => {
  const makeEntry = (
    id: string,
    model: string,
    tier: 'fast' | 'code' | 'think'
  ): ModelHopperEntry => ({
    id,
    model,
    tier,
    enabled: true,
  })

  it('reorders entries within a tier by priority list position', () => {
    const entries: ModelHopperEntry[] = [
      makeEntry('f1', 'ollama_chat/model-b', 'fast'),
      makeEntry('f2', 'ollama_chat/model-a', 'fast'),
    ]
    const result = applyPriorityOrder(entries, ['model-a', 'model-b'])
    expect(result[0].id).toBe('f2') // model-a is first in priority
    expect(result[1].id).toBe('f1') // model-b is second
  })

  it('maintains tier grouping order: fast, code, think', () => {
    const entries: ModelHopperEntry[] = [
      makeEntry('t1', 'ollama_chat/think-model', 'think'),
      makeEntry('c1', 'ollama_chat/code-model', 'code'),
      makeEntry('f1', 'ollama_chat/fast-model', 'fast'),
    ]
    const result = applyPriorityOrder(entries, [
      'fast-model',
      'code-model',
      'think-model',
    ])
    expect(result[0].tier).toBe('fast')
    expect(result[1].tier).toBe('code')
    expect(result[2].tier).toBe('think')
  })

  it('assigns priorityRank sequentially across tiers', () => {
    const entries: ModelHopperEntry[] = [
      makeEntry('f1', 'ollama_chat/fast-a', 'fast'),
      makeEntry('c1', 'ollama_chat/code-a', 'code'),
      makeEntry('t1', 'ollama_chat/think-a', 'think'),
    ]
    const result = applyPriorityOrder(entries, ['fast-a', 'code-a', 'think-a'])
    expect(result[0].priorityRank).toBe(0)
    expect(result[1].priorityRank).toBe(1)
    expect(result[2].priorityRank).toBe(2)
  })

  it('places entries not in priority list at end of their tier group', () => {
    const entries: ModelHopperEntry[] = [
      makeEntry('f1', 'ollama_chat/unknown-model', 'fast'),
      makeEntry('f2', 'ollama_chat/known-model', 'fast'),
    ]
    const result = applyPriorityOrder(entries, ['known-model'])
    expect(result[0].id).toBe('f2') // known-model first
    expect(result[1].id).toBe('f1') // unknown at end
  })

  it('does not mutate the input array', () => {
    const entries: ModelHopperEntry[] = [
      makeEntry('f1', 'ollama_chat/model-b', 'fast'),
      makeEntry('f2', 'ollama_chat/model-a', 'fast'),
    ]
    const original = [...entries]
    applyPriorityOrder(entries, ['model-a', 'model-b'])
    expect(entries).toEqual(original)
  })

  it('strips ollama_chat/ prefix for priority matching', () => {
    const entries: ModelHopperEntry[] = [
      makeEntry('f1', 'ollama_chat/deepseek-r1:32b', 'think'),
      makeEntry('f2', 'ollama_chat/qwen3:30b', 'think'),
    ]
    const result = applyPriorityOrder(entries, ['qwen3:30b', 'deepseek-r1:32b'])
    expect(result[0].id).toBe('f2') // qwen3 first in priority
    expect(result[1].id).toBe('f1') // deepseek second
  })

  it('handles empty priority list gracefully', () => {
    const entries: ModelHopperEntry[] = [
      makeEntry('f1', 'ollama_chat/model-a', 'fast'),
      makeEntry('c1', 'ollama_chat/model-b', 'code'),
    ]
    const result = applyPriorityOrder(entries, [])
    // All entries go to end of their tier (order preserved as tiebreaker)
    expect(result).toHaveLength(2)
    expect(result[0].tier).toBe('fast')
    expect(result[1].tier).toBe('code')
  })

  it('handles entries without ollama_chat/ prefix', () => {
    const entries: ModelHopperEntry[] = [
      makeEntry('f1', 'raw-model-b', 'fast'),
      makeEntry('f2', 'raw-model-a', 'fast'),
    ]
    const result = applyPriorityOrder(entries, ['raw-model-a', 'raw-model-b'])
    expect(result[0].id).toBe('f2')
    expect(result[1].id).toBe('f1')
  })
})

describe('reassignPriorityRanks', () => {
  const makeEntry = (
    id: string,
    model: string,
    tier: 'fast' | 'code' | 'think',
    priorityRank?: number
  ): ModelHopperEntry => ({
    id,
    model,
    tier,
    enabled: true,
    priorityRank,
  })

  it('assigns sequential ranks starting from 0', () => {
    const entries = [
      makeEntry('a', 'model-a', 'fast', 5),
      makeEntry('b', 'model-b', 'code', 10),
      makeEntry('c', 'model-c', 'think', 2),
    ]
    const result = reassignPriorityRanks(entries)
    expect(result[0].priorityRank).toBe(0)
    expect(result[1].priorityRank).toBe(1)
    expect(result[2].priorityRank).toBe(2)
  })

  it('preserves order of entries', () => {
    const entries = [
      makeEntry('a', 'model-a', 'fast'),
      makeEntry('b', 'model-b', 'code'),
    ]
    const result = reassignPriorityRanks(entries)
    expect(result[0].id).toBe('a')
    expect(result[1].id).toBe('b')
  })

  it('does not mutate the input array', () => {
    const entries = [makeEntry('a', 'model-a', 'fast', 5)]
    const result = reassignPriorityRanks(entries)
    expect(entries[0].priorityRank).toBe(5)
    expect(result[0].priorityRank).toBe(0)
  })

  it('handles empty array', () => {
    const result = reassignPriorityRanks([])
    expect(result).toEqual([])
  })
})

describe('reorderWithinTier', () => {
  const makeEntry = (
    id: string,
    model: string,
    tier: 'fast' | 'code' | 'think'
  ): ModelHopperEntry => ({
    id,
    model,
    tier,
    enabled: true,
  })

  it('replaces tier entries with reordered ones and reassigns ranks', () => {
    const all = [
      makeEntry('f1', 'fast-a', 'fast'),
      makeEntry('f2', 'fast-b', 'fast'),
      makeEntry('c1', 'code-a', 'code'),
    ]
    // Reorder fast tier: swap f1 and f2
    const reordered = [
      makeEntry('f2', 'fast-b', 'fast'),
      makeEntry('f1', 'fast-a', 'fast'),
    ]
    const result = reorderWithinTier(all, 'fast', reordered)
    expect(result[0].id).toBe('f2')
    expect(result[1].id).toBe('f1')
    expect(result[2].id).toBe('c1')
    // Check ranks are sequential
    expect(result[0].priorityRank).toBe(0)
    expect(result[1].priorityRank).toBe(1)
    expect(result[2].priorityRank).toBe(2)
  })

  it('preserves entries from other tiers in their original positions', () => {
    const all = [
      makeEntry('f1', 'fast-a', 'fast'),
      makeEntry('c1', 'code-a', 'code'),
      makeEntry('c2', 'code-b', 'code'),
      makeEntry('t1', 'think-a', 'think'),
    ]
    // Reorder code tier: swap c1 and c2
    const reordered = [
      makeEntry('c2', 'code-b', 'code'),
      makeEntry('c1', 'code-a', 'code'),
    ]
    const result = reorderWithinTier(all, 'code', reordered)
    expect(result[0].id).toBe('f1')
    expect(result[1].id).toBe('c2')
    expect(result[2].id).toBe('c1')
    expect(result[3].id).toBe('t1')
  })

  it('UI order is authoritative — overrides any previous priorityRank', () => {
    const all = [
      { ...makeEntry('f1', 'fast-a', 'fast'), priorityRank: 0 },
      { ...makeEntry('f2', 'fast-b', 'fast'), priorityRank: 1 },
      { ...makeEntry('c1', 'code-a', 'code'), priorityRank: 2 },
    ]
    // Drag f2 above f1 — UI says f2 is now higher priority
    const reordered = [
      { ...makeEntry('f2', 'fast-b', 'fast'), priorityRank: 1 },
      { ...makeEntry('f1', 'fast-a', 'fast'), priorityRank: 0 },
    ]
    const result = reorderWithinTier(all, 'fast', reordered)
    // After reorder, f2 should have rank 0 (topmost) despite originally being rank 1
    expect(result[0].id).toBe('f2')
    expect(result[0].priorityRank).toBe(0)
    expect(result[1].id).toBe('f1')
    expect(result[1].priorityRank).toBe(1)
  })
})
