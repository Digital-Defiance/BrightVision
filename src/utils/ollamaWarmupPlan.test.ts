import { describe, expect, it } from 'vitest'
import { buildOllamaWarmupPlan } from './ollamaWarmupPlan'

describe('buildOllamaWarmupPlan', () => {
  it('default lane warms only the default model, exclusively', () => {
    const plan = buildOllamaWarmupPlan({
      routerLane: false,
      defaultModel: 'ollama_chat/llama3.2:3b',
    })
    expect(plan).toEqual([{ tag: 'ollama_chat/llama3.2:3b', exclusive: true }])
  })

  it('router lane warms every tier and keeps them resident (regression: no eviction)', () => {
    // Regression for e2e/router-llm.spec.ts: warming only the default model evicted the
    // router tiers, so the first fast-tier turn cold-loaded, stalled, and escalated to think.
    const plan = buildOllamaWarmupPlan({
      routerLane: true,
      defaultModel: 'ollama_chat/llama3.2:3b',
      routerTags: {
        fastTag: 'qwen2.5-coder:7b',
        codeTag: 'qwen3.6:27b-q4_K_M',
        thinkTag: 'deepseek-r1:32b',
      },
    })
    expect(plan).toEqual([
      { tag: 'qwen2.5-coder:7b', exclusive: true },
      { tag: 'qwen3.6:27b-q4_K_M', exclusive: false },
      { tag: 'deepseek-r1:32b', exclusive: false },
    ])
    // Exactly one exclusive (the first) — the rest must NOT evict prior tiers.
    expect(plan.filter((s) => s.exclusive)).toHaveLength(1)
    expect(plan[0]?.exclusive).toBe(true)
  })

  it('router lane dedupes shared tier tags (fast == code) and keeps one exclusive', () => {
    const plan = buildOllamaWarmupPlan({
      routerLane: true,
      defaultModel: 'ollama_chat/llama3.2:3b',
      routerTags: { fastTag: 'm:7b', codeTag: 'm:7b', thinkTag: 'big:32b' },
    })
    expect(plan).toEqual([
      { tag: 'm:7b', exclusive: true },
      { tag: 'big:32b', exclusive: false },
    ])
  })

  it('router lane with no think tag warms fast + code only', () => {
    const plan = buildOllamaWarmupPlan({
      routerLane: true,
      defaultModel: 'ollama_chat/llama3.2:3b',
      routerTags: { fastTag: 'fast:7b', codeTag: 'code:27b' },
    })
    expect(plan).toEqual([
      { tag: 'fast:7b', exclusive: true },
      { tag: 'code:27b', exclusive: false },
    ])
  })

  it('router lane defers think warmup when deferThinkWarmup (LM Studio / RAM)', () => {
    const plan = buildOllamaWarmupPlan({
      routerLane: true,
      defaultModel: 'ollama_chat/llama3.2:3b',
      routerTags: {
        fastTag: 'qwen2.5-coder:7b',
        codeTag: 'qwen3.6:27b',
        thinkTag: 'deepseek-r1:70b',
      },
      deferThinkWarmup: true,
    })
    expect(plan).toEqual([
      { tag: 'qwen2.5-coder:7b', exclusive: true },
      { tag: 'qwen3.6:27b', exclusive: false },
    ])
  })

  it('router lane with no resolved tier tags falls back to the default model', () => {
    const plan = buildOllamaWarmupPlan({
      routerLane: true,
      defaultModel: 'ollama_chat/llama3.2:3b',
      routerTags: { fastTag: '', codeTag: '  ' },
    })
    expect(plan).toEqual([{ tag: 'ollama_chat/llama3.2:3b', exclusive: true }])
  })
})
