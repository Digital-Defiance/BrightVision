import { describe, expect, it } from 'vitest'
import {
  applyLocalLlmHopperFromEnv,
  DEFAULT_MODEL_ROUTER_PREFS,
  effectiveRouterEnabled,
  formatModelRouteEvent,
  modelRouterApiPayload,
  normalizeKeepAliveHeavySec,
  normalizeModelRouteRole,
  normalizeModelRouterPrefs,
} from './modelRouterPrefs'
import { resolveHopperEnableThinking, resolveHopperModels } from './modelHopper'
import { updateHopperEntry } from './modelHopper'

const fastEnabledModels = DEFAULT_MODEL_ROUTER_PREFS.models.map((m) =>
  m.id === 'hopper-fast-deepseek' ? updateHopperEntry([m], m.id, { enabled: true })[0] : m
)

describe('effectiveRouterEnabled', () => {
  it('default-on for Ollama when fast tier is configured', () => {
    expect(
      effectiveRouterEnabled(
        { ...DEFAULT_MODEL_ROUTER_PREFS, enabled: false, models: fastEnabledModels },
        'ollama_chat/session'
      )
    ).toBe(true)
  })

  it('respects user opt-out', () => {
    expect(
      effectiveRouterEnabled(
        {
          ...DEFAULT_MODEL_ROUTER_PREFS,
          enabled: false,
          routerEnabledUserSet: true,
          models: fastEnabledModels,
        },
        'ollama_chat/session'
      )
    ).toBe(false)
  })

  it('MODEL_ROUTER=0 in env opts out', () => {
    expect(
      effectiveRouterEnabled(
        { ...DEFAULT_MODEL_ROUTER_PREFS, enabled: true, models: fastEnabledModels },
        'ollama_chat/session',
        false
      )
    ).toBe(false)
  })

  it('default-on for LM Studio when hopper fast tier uses openai/', () => {
    const lmStudioPrefs = {
      ...DEFAULT_MODEL_ROUTER_PREFS,
      enabled: true,
      models: [
        {
          id: 'e2e-fast',
          tier: 'fast' as const,
          model: 'openai/llama-3.2-3b-instruct',
          enabled: true,
          label: 'fast',
        },
        {
          id: 'e2e-code',
          tier: 'code' as const,
          model: 'openai/qwen2.5-coder-7b-instruct',
          enabled: true,
          label: 'code',
        },
      ],
    }
    expect(
      effectiveRouterEnabled(lmStudioPrefs, 'openai/llama-3.2-3b-instruct')
    ).toBe(true)
  })

  it('off for cloud openai/ when hopper is Ollama-only', () => {
    expect(
      effectiveRouterEnabled(
        { ...DEFAULT_MODEL_ROUTER_PREFS, enabled: true, models: fastEnabledModels },
        'openai/gpt-4'
      )
    ).toBe(false)
  })
})

describe('modelRouterApiPayload', () => {
  it('normalizes heavy keep-alive 0 to -1 in API payload', () => {
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
        keepAliveHeavySec: 0,
      },
      'ollama_chat/big'
    )
    expect(body?.keep_alive_heavy).toBe(-1)
  })

  it('returns undefined for cloud models', () => {
    expect(
      modelRouterApiPayload(
        { ...DEFAULT_MODEL_ROUTER_PREFS, enabled: true },
        'openai/gpt-4'
      )
    ).toBeUndefined()
  })

  it('returns payload for LM Studio session with openai/ hopper', () => {
    const models = [
      {
        id: 'e2e-fast',
        tier: 'fast' as const,
        model: 'openai/llama-3.2-3b-instruct',
        enabled: true,
        label: 'fast',
      },
      {
        id: 'e2e-code',
        tier: 'code' as const,
        model: 'openai/qwen2.5-coder-7b-instruct',
        enabled: true,
        label: 'code',
      },
    ]
    const body = modelRouterApiPayload(
      { ...DEFAULT_MODEL_ROUTER_PREFS, enabled: true, models },
      'openai/llama-3.2-3b-instruct'
    )
    expect(body?.enabled).toBe(true)
    expect(body?.fast_model).toBe('openai/llama-3.2-3b-instruct')
    expect(body?.code_model).toBe('openai/qwen2.5-coder-7b-instruct')
  })

  it('returns undefined when no fast model enabled in hopper', () => {
    expect(
      modelRouterApiPayload(
        { ...DEFAULT_MODEL_ROUTER_PREFS, enabled: true, routerEnabledUserSet: true },
        'ollama_chat/big'
      )
    ).toBeUndefined()
  })

  it('default-on payload when fast tier configured without explicit enabled', () => {
    const body = modelRouterApiPayload(
      { ...DEFAULT_MODEL_ROUTER_PREFS, enabled: false, models: fastEnabledModels },
      'ollama_chat/big'
    )
    expect(body?.enabled).toBe(true)
    expect(body?.fast_model).toBe('ollama_chat/deepseek-coder:6.7b')
  })

  it('maps hopper to API body with code and think models', () => {
    const models = DEFAULT_MODEL_ROUTER_PREFS.models.map((m) => {
      if (m.id === 'hopper-fast-deepseek') {
        return updateHopperEntry([m], m.id, { enabled: true })[0]
      }
      if (m.id === 'hopper-think-r1') {
        return updateHopperEntry([m], m.id, { enabled: true })[0]
      }
      return m
    })
    const body = modelRouterApiPayload(
      {
        ...DEFAULT_MODEL_ROUTER_PREFS,
        enabled: true,
        models,
      },
      'ollama_chat/big'
    )
    expect(body?.fast_model).toBe('ollama_chat/deepseek-coder:6.7b')
    expect(body?.code_model).toBe('ollama_chat/big')
    expect(body?.think_model).toBe('ollama_chat/deepseek-r1:32b')
    expect(body?.heavy_model).toBe('ollama_chat/big')
    expect(Array.isArray(body?.model_pool)).toBe(true)
    const tiers = (body?.model_pool as { tier: string; enable_thinking?: boolean }[]).map(
      (r) => r.tier
    )
    expect(tiers).toContain('think')
    expect(tiers).toContain('code')
    const thinkRow = (body?.model_pool as { tier: string; enable_thinking?: boolean }[]).find(
      (r) => r.tier === 'think'
    )
    const codeRow = (body?.model_pool as { tier: string; enable_thinking?: boolean }[]).find(
      (r) => r.tier === 'code'
    )
    expect(thinkRow?.enable_thinking).toBe(true)
    expect(codeRow?.enable_thinking).toBe(false)
  })

  it('uses per-hopper enableThinking override in model_pool', () => {
    const models = DEFAULT_MODEL_ROUTER_PREFS.models.map((m) => {
      if (m.id === 'hopper-fast-deepseek') {
        return updateHopperEntry([m], m.id, { enabled: true, enableThinking: true })[0]
      }
      return m
    })
    const body = modelRouterApiPayload(
      { ...DEFAULT_MODEL_ROUTER_PREFS, enabled: true, models },
      'ollama_chat/big'
    )
    const fastRow = (body?.model_pool as { tier: string; enable_thinking?: boolean }[]).find(
      (r) => r.tier === 'fast'
    )
    expect(fastRow?.enable_thinking).toBe(true)
    expect(resolveHopperEnableThinking(models[0]!)    ).toBe(true)
  })

  it('includes extra_params in model_pool when hopper JSON is set', () => {
    const models = DEFAULT_MODEL_ROUTER_PREFS.models.map((m) => {
      if (m.id === 'hopper-fast-deepseek') {
        return updateHopperEntry([m], m.id, {
          enabled: true,
          extraParams: '{"top_p": 0.9, "think": false}',
        })[0]
      }
      return m
    })
    const body = modelRouterApiPayload(
      { ...DEFAULT_MODEL_ROUTER_PREFS, enabled: true, models },
      'ollama_chat/big'
    )
    const fastRow = (
      body?.model_pool as { tier: string; extra_params?: Record<string, unknown> }[]
    ).find((r) => r.tier === 'fast')
    expect(fastRow?.extra_params).toEqual({ top_p: 0.9, think: false })
  })
})

describe('formatModelRouteEvent', () => {
  it('labels think/code/fast roles and think override', () => {
    expect(
      formatModelRouteEvent({
        role: 'think',
        model: 'ollama_chat/r1',
        enable_thinking: true,
        reasons: ['keyword:architect'],
      })
    ).toContain('Architect')
    expect(
      formatModelRouteEvent({
        tier: 'code',
        model: 'ollama_chat/qwen',
        enable_thinking: false,
      })
    ).toContain('Engineer')
    expect(formatModelRouteEvent({ tier: 'fast', model: 'ollama_chat/s' })).toContain(
      'Fighter pilot'
    )
    expect(normalizeModelRouteRole('heavy')).toBe('code')
  })
})

describe('normalizeModelRouterPrefs', () => {
  it('coerces keepAliveHeavySec 0 to -1', () => {
    const next = normalizeModelRouterPrefs({
      ...DEFAULT_MODEL_ROUTER_PREFS,
      keepAliveHeavySec: 0,
    })
    expect(next.keepAliveHeavySec).toBe(-1)
    expect(normalizeKeepAliveHeavySec(0)).toBe(-1)
    expect(normalizeKeepAliveHeavySec(-1)).toBe(-1)
    expect(normalizeKeepAliveHeavySec(300)).toBe(300)
  })
})

describe('applyLocalLlmHopperFromEnv', () => {
  const snap = {
    sources: ['x'],
    ollamaHost: null,
    dataModel: 'qwen3.6:27b',
    llmMode: null,
    fastModel: 'deepseek-coder:6.7b',
    codeModel: 'qwen3.6:27b',
    thinkModel: 'deepseek-r1:32b',
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
    const resolved = resolveHopperModels(next.models, 'ollama_chat/qwen3.6:27b')
    expect(resolved.fast).toBe('ollama_chat/deepseek-coder:6.7b')
    expect(resolved.code).toBe('ollama_chat/qwen3.6:27b')
    expect(resolved.think).toBe('ollama_chat/deepseek-r1:32b')
  })

  it('fillEmpty enables router when FAST_MODEL set and user has not opted out', () => {
    const next = applyLocalLlmHopperFromEnv(
      DEFAULT_MODEL_ROUTER_PREFS,
      snap,
      'ollama_chat/session',
      true
    )
    expect(next.enabled).toBe(true)
    expect(next.routerEnabledUserSet).toBeFalsy()
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

  it('legacy heavyModel maps to code tier', () => {
    const legacy = applyLocalLlmHopperFromEnv(
      DEFAULT_MODEL_ROUTER_PREFS,
      {
        ...snap,
        codeModel: null,
        heavyModel: 'qwen3.6:27b',
        thinkModel: null,
      },
      'ollama_chat/qwen3.6:27b',
      false
    )
    const { code, think } = resolveHopperModels(legacy.models, 'ollama_chat/qwen3.6:27b')
    expect(code).toBe('ollama_chat/qwen3.6:27b')
    expect(think).toBeNull()
  })

  it('FAST_THINK and CODE_THINK set hopper enableThinking on sync', () => {
    const next = applyLocalLlmHopperFromEnv(
      DEFAULT_MODEL_ROUTER_PREFS,
      { ...snap, fastThink: false, codeThink: false },
      'ollama_chat/qwen3.6:27b',
      false
    )
    const fast = next.models.find((m) => m.tier === 'fast')
    const code = next.models.find((m) => m.tier === 'code')
    const think = next.models.find((m) => m.tier === 'think')
    expect(fast?.enableThinking).toBe(false)
    expect(code?.enableThinking).toBe(false)
    expect(think?.enableThinking).toBeUndefined()
  })
})
