import { describe, expect, it } from 'vitest'
import {
  buildModelPickOptions,
  hopperEntryFromPick,
  isHopperModelTaken,
  normalizeHopperModelId,
} from './hopperModelCatalog'

describe('normalizeHopperModelId', () => {
  it('strips LiteLLM prefixes for comparison', () => {
    expect(normalizeHopperModelId('openai/qwen/qwen3.6-27b')).toBe('qwen/qwen3.6-27b')
    expect(normalizeHopperModelId('ollama_chat/llama3.2:3b')).toBe('llama3.2:3b')
  })
})

describe('isHopperModelTaken', () => {
  it('matches openai and bare tag', () => {
    expect(isHopperModelTaken(['openai/qwen/qwen3.6-27b'], 'qwen/qwen3.6-27b')).toBe(true)
  })
})

describe('buildModelPickOptions', () => {
  it('lists LM Studio catalog models with openai prefix', () => {
    const options = buildModelPickOptions({
      tier: 'code',
      snapshot: {
        ollamaHost: 'http://127.0.0.1:1234',
        reachable: true,
        configuredTag: 'qwen/qwen3.6-27b',
        configuredInPs: false,
        tagsText: '',
        psText: '',
        tagsRows: [{ name: 'qwen/qwen3.6-27b', context: 32768 }],
        backend: 'lmstudio',
      },
      existingModels: [],
    })
    const catalog = options.filter((o) => o.kind === 'catalog')
    expect(catalog).toHaveLength(1)
    expect(catalog[0].model).toBe('openai/qwen/qwen3.6-27b')
  })

  it('excludes models already in hopper across prefix styles', () => {
    const options = buildModelPickOptions({
      tier: 'fast',
      snapshot: {
        ollamaHost: 'http://127.0.0.1:1234',
        reachable: true,
        configuredTag: '',
        configuredInPs: false,
        tagsText: '',
        psText: '',
        tagsRows: [{ name: 'llama-3.2-3b-instruct' }],
        backend: 'lmstudio',
      },
      existingModels: ['openai/llama-3.2-3b-instruct'],
    })
    expect(options.some((o) => o.kind === 'catalog' && o.tag === 'llama-3.2-3b-instruct')).toBe(
      false
    )
  })

  it('includes env slot options from local-llm snapshot', () => {
    const options = buildModelPickOptions({
      tier: 'think',
      localLlmSnap: {
        sources: [],
        ollamaHost: null,
        dataModel: null,
        llmMode: null,
        thinkModel: 'qwen/qwen3.6-35b-a3b',
        backend: 'lmstudio',
      },
      existingModels: [],
    })
    const env = options.find((o) => o.kind === 'env' && o.envKey === 'THINK_MODEL')
    expect(env?.model).toBe('openai/qwen/qwen3.6-35b-a3b')
  })

  it('always includes custom option', () => {
    const options = buildModelPickOptions({
      tier: 'fast',
      existingModels: ['openai/a', 'openai/b'],
    })
    expect(options.some((o) => o.kind === 'custom')).toBe(true)
  })
})

describe('hopperEntryFromPick', () => {
  it('creates session code slot', () => {
    const entry = hopperEntryFromPick({
      kind: 'session-code',
      value: 'session-code',
      label: 'Session',
      tier: 'code',
      model: '',
    })
    expect(entry.tier).toBe('code')
    expect(entry.model).toBe('')
  })
})
