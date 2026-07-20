import { describe, expect, it } from 'vitest'
import { createHopperEntry } from '../theme/modelHopper'
import { buildHopperPrepareEntries, buildRouterRoutePullEntries } from './modelRouterLlm'
import type { ModelRouterPrefs } from '../theme/modelRouterPrefs'
import { DEFAULT_MODEL_ROUTER_PREFS } from '../theme/modelRouterPrefs'

describe('modelRouterLlm hopper entries', () => {
  const sessionModel = 'ollama_chat/qwen3.6:27b-q4_K_M'

  it('session start pulls fast, code, and think without preload', () => {
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
          id: 'code',
          model: '',
          tier: 'code',
          enabled: true,
        }),
        createHopperEntry({
          id: 'think',
          model: 'ollama_chat/deepseek-r1:32b',
          tier: 'think',
          enabled: true,
        }),
      ],
    }
    const route = buildRouterRoutePullEntries(prefs, sessionModel)
    expect(route).toHaveLength(3)
    expect(route.every((e) => e.preload === false)).toBe(true)
    expect(route.map((e) => e.model_tag).sort()).toEqual(
      ['deepseek-coder:6.7b', 'deepseek-r1:32b', 'qwen3.6:27b-q4_K_M'].sort()
    )
    const full = buildHopperPrepareEntries(prefs, sessionModel)
    expect(full.length).toBeGreaterThanOrEqual(route.length)
    expect(full.some((e) => e.preload)).toBe(true)
  })
})
