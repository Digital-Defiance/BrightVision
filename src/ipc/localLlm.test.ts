import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './config'
import {
  applyLocalLlmToConfig,
  formatLocalLlmEnvPanel,
  formatLocalLlmDirectoryHelper,
  localLlmEnvFileNote,
  formatLlmPingHint,
  formatLlmPingSummary,
  llmPingAlertSeverity,
  llmPingNeedsSessionStart,
  isOllamaVisionModel,
  ollamaChatModelFromTag,
  ollamaTagFromVisionModel,
} from './localLlm'

describe('localLlm', () => {
  it('detects ollama vision models', () => {
    expect(isOllamaVisionModel('ollama_chat/qwen3.6:27b-q4_K_M')).toBe(true)
    expect(isOllamaVisionModel('openai/gpt-4o')).toBe(false)
    expect(ollamaTagFromVisionModel('ollama_chat/foo:bar')).toBe('foo:bar')
  })

  it('maps Ollama tag to ollama_chat model id', () => {
    expect(ollamaChatModelFromTag('qwen3.6:27b-q4_K_M')).toBe(
      'ollama_chat/qwen3.6:27b-q4_K_M'
    )
  })

  it('fillEmpty only updates blank ollama base and default model', () => {
    const snap = {
      sources: ['/tmp/local-llm.env'],
      ollamaHost: 'http://localhost:11434',
      dataModel: 'llama3.2:latest',
      llmMode: 'plain',
    }
    const cfg = { ...DEFAULT_CONFIG, model: 'openai/gpt-4o', ollamaApiBase: '' }
    const merged = applyLocalLlmToConfig(cfg, snap, true)
    expect(merged.ollamaApiBase).toBe('http://localhost:11434')
    expect(merged.model).toBe('openai/gpt-4o')
  })

  it('overwrite applies host and model', () => {
    const snap = {
      sources: ['x'],
      ollamaHost: 'http://127.0.0.1:11434',
      dataModel: 'qwen3.6:27b-q4_K_M',
      llmMode: null,
    }
    const cfg = { ...DEFAULT_CONFIG, model: 'openai/gpt-4o', ollamaApiBase: 'http://old' }
    const merged = applyLocalLlmToConfig(cfg, snap, false)
    expect(merged.ollamaApiBase).toBe('http://127.0.0.1:11434')
    expect(merged.model).toBe('ollama_chat/qwen3.6:27b-q4_K_M')
  })

  it('formats ping summary', () => {
    expect(
      formatLlmPingSummary({
        ollamaReachable: true,
        modelPulled: true,
        modelLoaded: true,
        generateOk: true,
        latencyMs: 120,
        responsePreview: 'p',
        coreReachable: true,
        coreLatencyMs: 8,
        error: null,
        logs: [],
      })
    ).toBe('LLM OK (120ms) · Vision API OK (8ms)')
  })

  it('labels XDG env path and shows merge winner', () => {
    expect(localLlmEnvFileNote('/Users/me/.config/local-llm/env')).toContain('env')
    expect(localLlmEnvFileNote('/repo/local-llm.env')).toBeNull()
    const panel = formatLocalLlmEnvPanel({
      sources: ['/Users/me/.config/local-llm/env', '/repo/local-llm.env'],
      ollamaHost: 'http://127.0.0.1:11434',
      dataModel: 'llama3.2:3b',
      llmMode: null,
    })
    expect(panel).toContain('later files override')
    expect(panel).toContain('/repo/local-llm.env')
    expect(panel).toContain('DATA_MODEL=llama3.2:3b')
  })

  it('directory helper mentions override file name', () => {
    expect(formatLocalLlmDirectoryHelper(null, '/custom')).toContain(
      '/custom/local-llm.env'
    )
  })

  it('hints when Ollama ok but core is down', () => {
    const r = {
      ollamaReachable: true,
      modelPulled: true,
      modelLoaded: false,
      generateOk: true,
      latencyMs: 545,
      responsePreview: '',
      coreReachable: false,
      coreLatencyMs: null,
      coreHealthError: 'connection refused',
      error: null,
      logs: [],
    }
    expect(formatLlmPingSummary(r)).toBe('LLM OK (545ms) · Vision API not running')
    expect(llmPingNeedsSessionStart(r)).toBe(true)
    expect(llmPingAlertSeverity(r)).toBe('warning')
    expect(formatLlmPingHint(r)).toContain('Start Vision API')
    expect(formatLlmPingHint(r)).toContain('connection refused')
    expect(formatLlmPingHint(r)).toContain('Ping does not start')
  })

  it('full stack success is green', () => {
    expect(
      llmPingAlertSeverity({
        ollamaReachable: true,
        modelPulled: true,
        modelLoaded: true,
        generateOk: true,
        latencyMs: 1,
        responsePreview: null,
        coreReachable: true,
        coreLatencyMs: 2,
        error: null,
        logs: [],
      })
    ).toBe('success')
  })
})
