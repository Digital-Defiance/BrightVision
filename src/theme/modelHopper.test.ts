import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MODEL_HOPPER,
  createHopperEntry,
  hopperExtraParamsError,
  migrateLegacyRouterModels,
  parseHopperExtraParams,
  resolveHopperEnableThinking,
  resolveHopperModels,
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
