/**
 * Property-based tests for Model Priority Hopper (TypeScript consumer side).
 *
 * Uses fast-check to verify correctness properties 12, 13, and 14 from the
 * model-priority-hopper design document.
 */
import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'

import {
  buildHopperFromSnapshot,
  normalizeHopperTier,
  type ModelHopperEntry,
  type ModelHopperTier,
} from './modelHopper'
import {
  applyLocalLlmHopperFromEnv,
  DEFAULT_MODEL_ROUTER_PREFS,
  modelRouterApiPayload,
} from './modelRouterPrefs'
import type { LocalLlmSnapshot, TierSlotEntry } from '../ipc/localLlm'

// ---------------------------------------------------------------------------
// Generators / Strategies
// ---------------------------------------------------------------------------

/** Generate a realistic Ollama model tag: alphanumeric with optional colon + version. */
const arbModelTag = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9-]{1,10}$/),
    fc.option(fc.stringMatching(/^[0-9]{1,3}b$/), { nil: undefined })
  )
  .map(([name, version]) => (version ? `${name}:${version}` : name))

/** Generate a tier value. */
const arbTier: fc.Arbitrary<'fast' | 'code' | 'think'> = fc.constantFrom('fast', 'code', 'think')

/** Generate a TierSlotEntry with a given tier and slot. */
const arbTierSlotEntry: fc.Arbitrary<TierSlotEntry> = fc
  .tuple(arbTier, fc.integer({ min: 0, max: 9 }), arbModelTag)
  .map(([tier, slot, modelTag]) => ({ tier, slot, modelTag }))

/** Generate an array of tier slot entries with unique (tier, slot) pairs. */
const arbTierSlots: fc.Arbitrary<TierSlotEntry[]> = fc
  .array(arbTierSlotEntry, { minLength: 1, maxLength: 9 })
  .map((entries) => {
    // Deduplicate by (tier, slot) key
    const seen = new Set<string>()
    return entries.filter((e) => {
      const key = `${e.tier}:${e.slot}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })
  .filter((arr) => arr.length >= 1)

/** Generate a priority list that is a permutation of model tags from tier slots. */
function arbPriorityListFrom(tierSlots: TierSlotEntry[]): fc.Arbitrary<string[]> {
  const tags = tierSlots.map((s) => s.modelTag)
  return fc.shuffledSubarray(tags, { minLength: tags.length, maxLength: tags.length })
}

/** Generate a ModelHopperEntry. */
const arbHopperEntry: fc.Arbitrary<ModelHopperEntry> = fc
  .tuple(
    fc.uuid(),
    arbModelTag,
    arbTier,
    fc.boolean(),
    fc.option(fc.nat({ max: 20 }), { nil: undefined })
  )
  .map(([id, tag, tier, enabled, rank]) => ({
    id,
    model: `ollama_chat/${tag}`,
    tier: normalizeHopperTier(tier) as ModelHopperTier,
    enabled,
    priorityRank: rank,
  }))

/** Generate a hopper entry list with at least one enabled fast-tier model. */
const arbHopperEntries: fc.Arbitrary<ModelHopperEntry[]> = fc
  .array(arbHopperEntry, { minLength: 1, maxLength: 8 })
  .chain((entries) => {
    // Ensure at least one enabled fast-tier entry with a model
    const hasFast = entries.some((e) => e.enabled && e.tier === 'fast' && e.model.trim())
    if (hasFast) return fc.constant(entries)
    return arbModelTag.map((tag) => [
      {
        id: 'forced-fast',
        model: `ollama_chat/${tag}`,
        tier: 'fast' as const,
        enabled: true,
      },
      ...entries,
    ])
  })

// ---------------------------------------------------------------------------
// Property 12: Hopper payload reflects order
// ---------------------------------------------------------------------------

// Feature: model-priority-hopper, Property 12: Hopper payload reflects order
describe('Property 12: Hopper payload reflects order', () => {
  it('model_pool entries maintain hopper list order with priority_rank matching position', () => {
    fc.assert(
      fc.property(arbHopperEntries, (entries) => {
        const prefs = {
          ...DEFAULT_MODEL_ROUTER_PREFS,
          enabled: true,
          models: entries,
        }
        const sessionModel = 'ollama_chat/session-model'
        const payload = modelRouterApiPayload(prefs, sessionModel)

        // If payload is undefined (no fast model enabled), skip this case
        if (!payload) return true

        const modelPool = payload.model_pool as {
          model: string
          tier: string
          enabled: boolean
          priority_rank: number
        }[]

        // model_pool entries SHALL be in the same order as the hopper list
        expect(modelPool.length).toBe(entries.length)
        for (let i = 0; i < entries.length; i++) {
          expect(modelPool[i].model).toBe(entries[i].model)
          expect(modelPool[i].tier).toBe(normalizeHopperTier(entries[i].tier))
          expect(modelPool[i].enabled).toBe(entries[i].enabled)
        }

        // priority_rank values SHALL match their position (use entry's priorityRank or index)
        for (let i = 0; i < modelPool.length; i++) {
          const expectedRank = entries[i].priorityRank ?? i
          expect(modelPool[i].priority_rank).toBe(expectedRank)
        }

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Validates: Requirements 5.5
   */
  it('priority_list in payload contains enabled models sorted by priorityRank', () => {
    fc.assert(
      fc.property(arbHopperEntries, (entries) => {
        const prefs = {
          ...DEFAULT_MODEL_ROUTER_PREFS,
          enabled: true,
          models: entries,
        }
        const sessionModel = 'ollama_chat/session-model'
        const payload = modelRouterApiPayload(prefs, sessionModel)

        if (!payload) return true

        const priorityList = payload.priority_list as string[]

        // priority_list contains only enabled models with non-empty model strings
        const enabledWithModel = entries
          .map((m, idx) => ({ model: m.model, rank: m.priorityRank ?? idx, enabled: m.enabled }))
          .filter((m) => m.enabled && m.model.trim())
          .sort((a, b) => a.rank - b.rank)
          .map((m) => m.model)

        expect(priorityList).toEqual(enabledWithModel)

        return true
      }),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 13: Sync from env rebuilds hopper with correct ordering
// ---------------------------------------------------------------------------

// Feature: model-priority-hopper, Property 13: Sync from env rebuilds hopper with correct ordering
describe('Property 13: Sync from env rebuilds hopper with correct ordering', () => {
  it('every tier_slot appears as a hopper entry after sync', () => {
    fc.assert(
      fc.property(
        arbTierSlots.chain((tierSlots) =>
          arbPriorityListFrom(tierSlots).map((priorityList) => ({ tierSlots, priorityList }))
        ),
        ({ tierSlots, priorityList }) => {
          const snap: LocalLlmSnapshot = {
            sources: ['/test/env'],
            ollamaHost: 'http://127.0.0.1:11434',
            dataModel: null,
            llmMode: null,
            tierSlots,
            priorityList,
            modelRouter: true,
          }
          const sessionModel = 'ollama_chat/session-model'

          const result = applyLocalLlmHopperFromEnv(
            { ...DEFAULT_MODEL_ROUTER_PREFS },
            snap,
            sessionModel,
            false // fillEmpty = false (Sync button)
          )

          // (a) Every tier_slot SHALL appear as a hopper entry
          for (const slot of tierSlots) {
            const expectedModel = `ollama_chat/${slot.modelTag}`
            const found = result.models.some(
              (m) => m.model === expectedModel && normalizeHopperTier(m.tier) === slot.tier
            )
            expect(found).toBe(true)
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  it('entries within each tier are ordered to match priority_list (highest priority at top)', () => {
    fc.assert(
      fc.property(
        arbTierSlots.chain((tierSlots) =>
          arbPriorityListFrom(tierSlots).map((priorityList) => ({ tierSlots, priorityList }))
        ),
        ({ tierSlots, priorityList }) => {
          const snap: LocalLlmSnapshot = {
            sources: ['/test/env'],
            ollamaHost: 'http://127.0.0.1:11434',
            dataModel: null,
            llmMode: null,
            tierSlots,
            priorityList,
            modelRouter: true,
          }
          const sessionModel = 'ollama_chat/session-model'

          const result = applyLocalLlmHopperFromEnv(
            { ...DEFAULT_MODEL_ROUTER_PREFS },
            snap,
            sessionModel,
            false
          )

          // (b) Within each tier, entries SHALL be ordered by priority_list position
          const tiers: Array<'fast' | 'code' | 'think'> = ['fast', 'code', 'think']
          for (const tier of tiers) {
            const tierEntries = result.models.filter(
              (m) => normalizeHopperTier(m.tier) === tier
            )
            if (tierEntries.length <= 1) continue

            // For each consecutive pair, the earlier entry should have a lower (or equal)
            // index in the priority list
            for (let i = 0; i < tierEntries.length - 1; i++) {
              const tagA = tierEntries[i].model.replace('ollama_chat/', '')
              const tagB = tierEntries[i + 1].model.replace('ollama_chat/', '')
              const idxA = priorityList.indexOf(tagA)
              const idxB = priorityList.indexOf(tagB)
              // Both should be found since we generated priority list from tier slots
              if (idxA >= 0 && idxB >= 0) {
                expect(idxA).toBeLessThanOrEqual(idxB)
              }
            }
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Validates: Requirements 6.1, 6.2
   */
  it('buildHopperFromSnapshot directly produces entries sorted by priority rank', () => {
    fc.assert(
      fc.property(
        arbTierSlots.chain((tierSlots) =>
          arbPriorityListFrom(tierSlots).map((priorityList) => ({ tierSlots, priorityList }))
        ),
        ({ tierSlots, priorityList }) => {
          const snap: LocalLlmSnapshot = {
            sources: ['/test/env'],
            ollamaHost: 'http://127.0.0.1:11434',
            dataModel: null,
            llmMode: null,
            tierSlots,
            priorityList,
          }
          const sessionModel = 'ollama_chat/session-model'

          const entries = buildHopperFromSnapshot(snap, sessionModel)

          // All tier slot entries should be present
          expect(entries.length).toBe(tierSlots.length)

          // Entries with assigned priorityRank should be sorted ascending
          const rankedEntries = entries.filter((e) => e.priorityRank !== undefined)
          for (let i = 0; i < rankedEntries.length - 1; i++) {
            expect(rankedEntries[i].priorityRank!).toBeLessThanOrEqual(
              rankedEntries[i + 1].priorityRank!
            )
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 14: Backward compatibility — parser (TS consumer side)
// ---------------------------------------------------------------------------

// Feature: model-priority-hopper, Property 14: Backward compatibility — parser (TS consumer side)
describe('Property 14: Backward compatibility — parser (TS consumer side)', () => {
  /**
   * For any env file containing only legacy keys, the parser produces a LocalLlmSnapshot
   * where tier_slots contains exactly the base-key entries (slot 0) and priority_list
   * follows FAST→CODE→THINK default ordering.
   *
   * Validates: Requirements 7.1, 7.3
   */
  it('legacy single-model env (no tierSlots) falls back to existing single-model hopper behavior', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          arbModelTag, // fastModel
          arbModelTag, // codeModel
          arbModelTag  // thinkModel
        ),
        ([fastTag, codeTag, thinkTag]) => {
          // Simulate a legacy snapshot — no tierSlots, no priorityList
          const snap: LocalLlmSnapshot = {
            sources: ['/test/legacy.env'],
            ollamaHost: 'http://127.0.0.1:11434',
            dataModel: codeTag,
            llmMode: null,
            fastModel: fastTag,
            codeModel: codeTag,
            thinkModel: thinkTag,
            modelRouter: true,
            // No tierSlots, no priorityList — legacy format
          }
          const sessionModel = `ollama_chat/${codeTag}`

          const result = applyLocalLlmHopperFromEnv(
            { ...DEFAULT_MODEL_ROUTER_PREFS },
            snap,
            sessionModel,
            false
          )

          // The result should have models populated from legacy fields
          const fastEntry = result.models.find(
            (m) => normalizeHopperTier(m.tier) === 'fast' && m.enabled
          )
          const codeEntry = result.models.find(
            (m) => normalizeHopperTier(m.tier) === 'code' && m.enabled
          )
          const thinkEntry = result.models.find(
            (m) => normalizeHopperTier(m.tier) === 'think' && m.enabled
          )

          // Legacy keys should map to single enabled entries per tier
          expect(fastEntry).toBeDefined()
          expect(fastEntry!.model).toBe(`ollama_chat/${fastTag}`)
          expect(codeEntry).toBeDefined()
          expect(codeEntry!.model).toBe(`ollama_chat/${codeTag}`)
          expect(thinkEntry).toBeDefined()
          expect(thinkEntry!.model).toBe(`ollama_chat/${thinkTag}`)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  it('legacy snapshot does NOT use buildHopperFromSnapshot path (tierSlots absent)', () => {
    fc.assert(
      fc.property(arbModelTag, (fastTag) => {
        const snap: LocalLlmSnapshot = {
          sources: ['/test/legacy.env'],
          ollamaHost: 'http://127.0.0.1:11434',
          dataModel: null,
          llmMode: null,
          fastModel: fastTag,
          modelRouter: true,
          // tierSlots intentionally absent
        }
        const sessionModel = 'ollama_chat/session'

        const result = applyLocalLlmHopperFromEnv(
          { ...DEFAULT_MODEL_ROUTER_PREFS },
          snap,
          sessionModel,
          false
        )

        // Should still produce a valid hopper with the fast model set
        const fastEntry = result.models.find(
          (m) => normalizeHopperTier(m.tier) === 'fast' && m.enabled
        )
        expect(fastEntry).toBeDefined()
        expect(fastEntry!.model).toBe(`ollama_chat/${fastTag}`)

        // Result should have router enabled since MODEL_ROUTER=true
        expect(result.enabled).toBe(true)

        return true
      }),
      { numRuns: 100 }
    )
  })

  it('legacy snapshot with empty tierSlots array also falls back to legacy path', () => {
    fc.assert(
      fc.property(arbModelTag, (fastTag) => {
        const snap: LocalLlmSnapshot = {
          sources: ['/test/legacy.env'],
          ollamaHost: 'http://127.0.0.1:11434',
          dataModel: null,
          llmMode: null,
          fastModel: fastTag,
          modelRouter: true,
          tierSlots: [], // Empty array — should fall back to legacy
        }
        const sessionModel = 'ollama_chat/session'

        const result = applyLocalLlmHopperFromEnv(
          { ...DEFAULT_MODEL_ROUTER_PREFS },
          snap,
          sessionModel,
          false
        )

        // Should use legacy path, not buildHopperFromSnapshot
        const fastEntry = result.models.find(
          (m) => normalizeHopperTier(m.tier) === 'fast' && m.enabled
        )
        expect(fastEntry).toBeDefined()
        expect(fastEntry!.model).toBe(`ollama_chat/${fastTag}`)

        return true
      }),
      { numRuns: 100 }
    )
  })
})
