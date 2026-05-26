import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODEL_HOPPER,
  migrateLegacyRouterModels,
  resolveHopperModels,
} from './modelHopper'

describe('modelHopper', () => {
  it('resolves first enabled fast and heavy', () => {
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
        model: 'ollama_chat/heavy-c',
        tier: 'heavy' as const,
        enabled: true,
      },
    ]
    expect(resolveHopperModels(models, 'ollama_chat/session')).toEqual({
      fast: 'ollama_chat/fast-b',
      heavy: 'ollama_chat/heavy-c',
    })
  })

  it('heavy row with empty model uses session', () => {
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
        tier: 'heavy' as const,
        enabled: true,
      },
    ]
    expect(resolveHopperModels(models, 'ollama_chat/big')).toEqual({
      fast: 'ollama_chat/fast',
      heavy: 'ollama_chat/big',
    })
  })

  it('migrates legacy fastModel', () => {
    const hopper = migrateLegacyRouterModels({
      fastModel: 'ollama_chat/legacy-fast',
    })
    const enabledFast = hopper.find((m) => m.tier === 'fast' && m.enabled)
    expect(enabledFast?.model).toBe('ollama_chat/legacy-fast')
  })
})
