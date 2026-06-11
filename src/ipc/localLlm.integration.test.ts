/**
 * Integration test: env→Rust parse→IPC→TypeScript snapshot flow.
 *
 * These tests verify that a JSON snapshot matching the Rust parser's serialized
 * output gets correctly consumed by buildHopperFromSnapshot and
 * applyLocalLlmHopperFromEnv on the TypeScript side.
 *
 * Task 8.3 — Validates: Requirements 7.1, 6.1
 */
import { describe, expect, it } from 'vitest'
import type { LocalLlmSnapshot } from './localLlm'
import {
  buildHopperFromSnapshot,
  normalizeHopperTier,
} from '../theme/modelHopper'
import {
  applyLocalLlmHopperFromEnv,
  DEFAULT_MODEL_ROUTER_PREFS,
} from '../theme/modelRouterPrefs'

describe('integration: env→Rust parse→IPC→TypeScript snapshot flow', () => {
  /**
   * Multi-model env file snapshot (matching Rust serialized output for):
   *
   * FAST_MODEL=deepseek-coder:6.7b
   * FAST_MODEL_1=qwen2.5-coder:7b
   * CODE_MODEL=qwen3.6:27b-q4_K_M
   * THINK_MODEL=deepseek-r1:32b
   * THINK_MODEL_1=qwen3:30b-q4_K_M
   * THINK_MODEL_2=llama3:70b-q4_K_M
   * MODEL_PRIORITY=THINK,CODE,FAST,FAST_1,THINK_1,THINK_2
   */
  const multiModelSnapshot: LocalLlmSnapshot = {
    sources: ['/project/local-llm.env'],
    ollamaHost: 'http://127.0.0.1:11434',
    dataModel: 'qwen3.6:27b-q4_K_M',
    llmMode: null,
    fastModel: 'deepseek-coder:6.7b',
    codeModel: 'qwen3.6:27b-q4_K_M',
    heavyModel: null,
    thinkModel: 'deepseek-r1:32b',
    modelRouter: true,
    fastThink: null,
    codeThink: null,
    tierSlots: [
      { tier: 'fast', slot: 0, modelTag: 'deepseek-coder:6.7b' },
      { tier: 'fast', slot: 1, modelTag: 'qwen2.5-coder:7b' },
      { tier: 'code', slot: 0, modelTag: 'qwen3.6:27b-q4_K_M' },
      { tier: 'think', slot: 0, modelTag: 'deepseek-r1:32b' },
      { tier: 'think', slot: 1, modelTag: 'qwen3:30b-q4_K_M' },
      { tier: 'think', slot: 2, modelTag: 'llama3:70b-q4_K_M' },
    ],
    priorityList: [
      'deepseek-r1:32b',
      'qwen3.6:27b-q4_K_M',
      'deepseek-coder:6.7b',
      'qwen2.5-coder:7b',
      'qwen3:30b-q4_K_M',
      'llama3:70b-q4_K_M',
    ],
    modelPriorityRaw: 'THINK,CODE,FAST,FAST_1,THINK_1,THINK_2',
    warnings: [],
  }

  /**
   * Legacy env file snapshot (matching Rust output for):
   *
   * FAST_MODEL=deepseek-coder:6.7b
   * CODE_MODEL=qwen3.6:27b-q4_K_M
   * THINK_MODEL=deepseek-r1:32b
   * (no numbered keys, no MODEL_PRIORITY)
   */
  const legacySnapshot: LocalLlmSnapshot = {
    sources: ['/project/local-llm.env'],
    ollamaHost: 'http://127.0.0.1:11434',
    dataModel: 'qwen3.6:27b-q4_K_M',
    llmMode: null,
    fastModel: 'deepseek-coder:6.7b',
    codeModel: 'qwen3.6:27b-q4_K_M',
    heavyModel: null,
    thinkModel: 'deepseek-r1:32b',
    modelRouter: true,
    fastThink: null,
    codeThink: null,
    tierSlots: [
      { tier: 'fast', slot: 0, modelTag: 'deepseek-coder:6.7b' },
      { tier: 'code', slot: 0, modelTag: 'qwen3.6:27b-q4_K_M' },
      { tier: 'think', slot: 0, modelTag: 'deepseek-r1:32b' },
    ],
    priorityList: [
      'deepseek-coder:6.7b',
      'qwen3.6:27b-q4_K_M',
      'deepseek-r1:32b',
    ],
    modelPriorityRaw: null,
    warnings: [],
  }

  describe('multi-model env file → buildHopperFromSnapshot', () => {
    it('produces one hopper entry per tier slot', () => {
      const entries = buildHopperFromSnapshot(
        multiModelSnapshot,
        'ollama_chat/qwen3.6:27b-q4_K_M'
      )
      expect(entries).toHaveLength(6)
    })

    it('assigns correct tiers to each entry', () => {
      const entries = buildHopperFromSnapshot(
        multiModelSnapshot,
        'ollama_chat/qwen3.6:27b-q4_K_M'
      )
      const fastEntries = entries.filter((e) => normalizeHopperTier(e.tier) === 'fast')
      const codeEntries = entries.filter((e) => normalizeHopperTier(e.tier) === 'code')
      const thinkEntries = entries.filter((e) => normalizeHopperTier(e.tier) === 'think')

      expect(fastEntries).toHaveLength(2)
      expect(codeEntries).toHaveLength(1)
      expect(thinkEntries).toHaveLength(3)
    })

    it('produces LiteLLM model ids with ollama_chat/ prefix', () => {
      const entries = buildHopperFromSnapshot(
        multiModelSnapshot,
        'ollama_chat/qwen3.6:27b-q4_K_M'
      )
      for (const entry of entries) {
        expect(entry.model).toMatch(/^ollama_chat\//)
      }
    })

    it('assigns priorityRank matching priorityList order', () => {
      const entries = buildHopperFromSnapshot(
        multiModelSnapshot,
        'ollama_chat/qwen3.6:27b-q4_K_M'
      )
      // Entries are sorted by priorityRank (ascending)
      // deepseek-r1:32b is position 0 in priorityList
      const thinkBase = entries.find((e) => e.model === 'ollama_chat/deepseek-r1:32b')
      expect(thinkBase).toBeDefined()
      expect(thinkBase!.priorityRank).toBe(0)

      // qwen3.6:27b-q4_K_M is position 1
      const codeBase = entries.find((e) => e.model === 'ollama_chat/qwen3.6:27b-q4_K_M')
      expect(codeBase).toBeDefined()
      expect(codeBase!.priorityRank).toBe(1)

      // deepseek-coder:6.7b is position 2
      const fastBase = entries.find((e) => e.model === 'ollama_chat/deepseek-coder:6.7b')
      expect(fastBase).toBeDefined()
      expect(fastBase!.priorityRank).toBe(2)

      // qwen2.5-coder:7b is position 3
      const fast1 = entries.find((e) => e.model === 'ollama_chat/qwen2.5-coder:7b')
      expect(fast1).toBeDefined()
      expect(fast1!.priorityRank).toBe(3)

      // qwen3:30b-q4_K_M is position 4
      const think1 = entries.find((e) => e.model === 'ollama_chat/qwen3:30b-q4_K_M')
      expect(think1).toBeDefined()
      expect(think1!.priorityRank).toBe(4)

      // llama3:70b-q4_K_M is position 5
      const think2 = entries.find((e) => e.model === 'ollama_chat/llama3:70b-q4_K_M')
      expect(think2).toBeDefined()
      expect(think2!.priorityRank).toBe(5)
    })

    it('assigns correct tierSlot values', () => {
      const entries = buildHopperFromSnapshot(
        multiModelSnapshot,
        'ollama_chat/qwen3.6:27b-q4_K_M'
      )
      const fastBase = entries.find((e) => e.model === 'ollama_chat/deepseek-coder:6.7b')
      expect(fastBase!.tierSlot).toBe(0)

      const fast1 = entries.find((e) => e.model === 'ollama_chat/qwen2.5-coder:7b')
      expect(fast1!.tierSlot).toBe(1)

      const think2 = entries.find((e) => e.model === 'ollama_chat/llama3:70b-q4_K_M')
      expect(think2!.tierSlot).toBe(2)
    })

    it('all entries are enabled', () => {
      const entries = buildHopperFromSnapshot(
        multiModelSnapshot,
        'ollama_chat/qwen3.6:27b-q4_K_M'
      )
      for (const entry of entries) {
        expect(entry.enabled).toBe(true)
      }
    })
  })

  describe('multi-model snapshot → applyLocalLlmHopperFromEnv', () => {
    it('populates hopper with all tier slot entries', () => {
      const result = applyLocalLlmHopperFromEnv(
        { ...DEFAULT_MODEL_ROUTER_PREFS },
        multiModelSnapshot,
        'ollama_chat/qwen3.6:27b-q4_K_M',
        false
      )
      expect(result.models).toHaveLength(6)
      expect(result.enabled).toBe(true)
    })

    it('entries sorted by priority rank (highest priority first)', () => {
      const result = applyLocalLlmHopperFromEnv(
        { ...DEFAULT_MODEL_ROUTER_PREFS },
        multiModelSnapshot,
        'ollama_chat/qwen3.6:27b-q4_K_M',
        false
      )
      // Verify priority ranks are in ascending order (sorted)
      for (let i = 1; i < result.models.length; i++) {
        const prevRank = result.models[i - 1].priorityRank ?? Infinity
        const currRank = result.models[i].priorityRank ?? Infinity
        expect(currRank).toBeGreaterThanOrEqual(prevRank)
      }
    })
  })

  describe('backward-compat env (no numbered keys) → same snapshot as before', () => {
    it('produces 3 hopper entries (one per tier) from legacy snapshot', () => {
      const entries = buildHopperFromSnapshot(
        legacySnapshot,
        'ollama_chat/qwen3.6:27b-q4_K_M'
      )
      expect(entries).toHaveLength(3)

      const tiers = entries.map((e) => normalizeHopperTier(e.tier))
      expect(tiers).toContain('fast')
      expect(tiers).toContain('code')
      expect(tiers).toContain('think')
    })

    it('assigns default FAST→CODE→THINK priority ordering', () => {
      const entries = buildHopperFromSnapshot(
        legacySnapshot,
        'ollama_chat/qwen3.6:27b-q4_K_M'
      )
      // deepseek-coder:6.7b (FAST) should have lowest priority rank
      const fast = entries.find((e) => e.model === 'ollama_chat/deepseek-coder:6.7b')
      const code = entries.find((e) => e.model === 'ollama_chat/qwen3.6:27b-q4_K_M')
      const think = entries.find((e) => e.model === 'ollama_chat/deepseek-r1:32b')

      expect(fast).toBeDefined()
      expect(code).toBeDefined()
      expect(think).toBeDefined()

      expect(fast!.priorityRank).toBe(0) // FAST first in default
      expect(code!.priorityRank).toBe(1) // CODE second
      expect(think!.priorityRank).toBe(2) // THINK third
    })

    it('all entries have slot 0', () => {
      const entries = buildHopperFromSnapshot(
        legacySnapshot,
        'ollama_chat/qwen3.6:27b-q4_K_M'
      )
      for (const entry of entries) {
        expect(entry.tierSlot).toBe(0)
      }
    })

    it('applyLocalLlmHopperFromEnv with legacy snapshot enables router and sets entries', () => {
      const result = applyLocalLlmHopperFromEnv(
        { ...DEFAULT_MODEL_ROUTER_PREFS },
        legacySnapshot,
        'ollama_chat/qwen3.6:27b-q4_K_M',
        false
      )
      expect(result.enabled).toBe(true)
      expect(result.models).toHaveLength(3)
    })

    it('legacy snapshot hopper entries match backward-compat field values', () => {
      const entries = buildHopperFromSnapshot(
        legacySnapshot,
        'ollama_chat/qwen3.6:27b-q4_K_M'
      )
      // The models from tierSlots should match the legacy fastModel/codeModel/thinkModel
      const models = entries.map((e) => e.model).sort()
      expect(models).toContain('ollama_chat/deepseek-coder:6.7b')
      expect(models).toContain('ollama_chat/qwen3.6:27b-q4_K_M')
      expect(models).toContain('ollama_chat/deepseek-r1:32b')
    })
  })
})
