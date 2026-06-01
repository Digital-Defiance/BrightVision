import { describe, expect, it } from 'vitest'
import {
  applyLocalLlmHopperFromEnv,
  DEFAULT_MODEL_ROUTER_PREFS,
  modelRouterApiPayload,
} from './modelRouterPrefs'
import { resolveHopperModels } from './modelHopper'
import { updateHopperEntry } from './modelHopper'

describe('modelRouterApiPayload', () => {
  it('returns undefined for cloud models', () => {
    expect(
      modelRouterApiPayload(
        { ...DEFAULT_MODEL_ROUTER_PREFS, enabled: true },
        'openai/gpt-4'
      )
    ).toBeUndefined()
  })

  it('returns undefined when no fast model enabled in hopper', () => {
    expect(
      modelRouterApiPayload(
        { ...DEFAULT_MODEL_ROUTER_PREFS, enabled: true },
        'ollama_chat/big'
      )
    ).toBeUndefined()
  })

  it('maps hopper to API body with model_pool', () => {
    const models = DEFAULT_MODEL_ROUTER_PREFS.models.map((m) =>
      m.tier === 'fast' && m.id === 'hopper-fast-deepseek'
        ? updateHopperEntry([m], m.id, { enabled: true })[0]
        : m
    )
    const body = modelRouterApiPayload(
      {
        ...DEFAULT_MODEL_ROUTER_PREFS,
        enabled: true,
        models,
      },
      'ollama_chat/big'
    )
    expect(body?.fast_model).toBe('ollama_chat/deepseek-coder:6.7b')
    expect(body?.heavy_model).toBe('ollama_chat/big')
    expect(Array.isArray(body?.model_pool)).toBe(true)
  })
})

describe('applyLocalLlmHopperFromEnv', () => {
  const snap = {
    sources: ['x'],
    ollamaHost: null,
    dataModel: 'qwen3.6:27b',
    llmMode: null,
    fastModel: 'deepseek-coder:6.7b',
    heavyModel: 'qwen3.6:27b',
    modelRouter: true,
  }

  it('overwrites hopper on sync (fillEmpty false)', () => {
    const next = applyLocalLlmHopperFromEnv(
      { ...DEFAULT_MODEL_ROUTER_PREFS, enabled: false },
      snap,
      'ollama_chat/qwen3.6:27b',
      false
    )
    expect(next.enabled).toBe(true)
    const { fast, heavy } = resolveHopperModels(next.models, 'ollama_chat/qwen3.6:27b')
    expect(fast).toBe('ollama_chat/deepseek-coder:6.7b')
    expect(heavy).toBe('ollama_chat/qwen3.6:27b')
  })

  it('fillEmpty skips fast tier when hopper already has fast', () => {
    const withFast = applyLocalLlmHopperFromEnv(
      DEFAULT_MODEL_ROUTER_PREFS,
      snap,
      'ollama_chat/session',
      false
    )
    const again = applyLocalLlmHopperFromEnv(
      withFast,
      { ...snap, fastModel: 'other:tag' },
      'ollama_chat/session',
      true
    )
    const { fast } = resolveHopperModels(again.models, 'ollama_chat/session')
    expect(fast).toBe('ollama_chat/deepseek-coder:6.7b')
  })
})
