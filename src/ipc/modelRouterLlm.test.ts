import { describe, expect, it } from 'vitest'
import { createHopperEntry } from '../theme/modelHopper'
import { buildHopperPrepareEntries, buildRouterRoutePullEntries } from './modelRouterLlm'
import type { ModelRouterPrefs } from '../theme/modelRouterPrefs'
import { DEFAULT_MODEL_ROUTER_PREFS } from '../theme/modelRouterPrefs'

describe('modelRouterLlm hopper entries', () => {
  const sessionModel = 'ollama_chat/qwen3.6:27b-q4_K_M'

  it('session start pulls only resolved fast/heavy without preload', () => {
    const prefs: ModelRouterPrefs = {
      ...DEFAULT_MODEL_ROUTER_PREFS,
      enabled: true,
      models: [
        createHopperEntry({
          id: 'fast-a',
          model: 'ollama_chat/deepseek-coder:6.7b',
          tier: 'fast',
          enabled: true,
        }),
        createHopperEntry({
          id: 'fast-b',
          model: 'ollama_chat/qwen2.5-coder:7b',
          tier: 'fast',
          enabled: true,
        }),
        createHopperEntry({
          id: 'heavy',
          model: '',
          tier: 'heavy',
          enabled: true,
        }),
      ],
    }
    const route = buildRouterRoutePullEntries(prefs, sessionModel)
    expect(route).toHaveLength(2)
    expect(route.every((e) => e.preload === false)).toBe(true)
    expect(route.map((e) => e.model_tag).sort()).toEqual(
      ['deepseek-coder:6.7b', 'qwen3.6:27b-q4_K_M'].sort()
    )
    const full = buildHopperPrepareEntries(prefs, sessionModel)
    expect(full.length).toBeGreaterThan(route.length)
    expect(full.some((e) => e.preload)).toBe(true)
  })
})
