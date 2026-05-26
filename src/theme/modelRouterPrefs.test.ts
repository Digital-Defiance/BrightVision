import { describe, expect, it } from 'vitest'
import { DEFAULT_MODEL_ROUTER_PREFS, modelRouterApiPayload } from './modelRouterPrefs'
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
