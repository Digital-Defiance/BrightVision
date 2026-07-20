import { describe, expect, it } from 'vitest'
import { capabilitiesForBackend } from '../../ipc/localLlm'

describe('useBackendCapabilities / capabilitiesForBackend', () => {
  it('ollama enables all lifecycle controls', () => {
    expect(capabilitiesForBackend('ollama')).toEqual({
      supportsVramQuery: true,
      supportsModelPull: true,
      supportsContextWindowQuery: true,
    })
  })

  it('defaults missing backend to ollama', () => {
    expect(capabilitiesForBackend(null)).toEqual({
      supportsVramQuery: true,
      supportsModelPull: true,
      supportsContextWindowQuery: true,
    })
  })

  it('vllm disables pull and VRAM query', () => {
    expect(capabilitiesForBackend('vllm')).toEqual({
      supportsVramQuery: false,
      supportsModelPull: false,
      supportsContextWindowQuery: false,
    })
  })

  it('llamacpp disables pull and VRAM query', () => {
    expect(capabilitiesForBackend('llamacpp')).toEqual({
      supportsVramQuery: false,
      supportsModelPull: false,
      supportsContextWindowQuery: false,
    })
  })

  it('lmstudio enables context query only', () => {
    expect(capabilitiesForBackend('lmstudio')).toEqual({
      supportsVramQuery: false,
      supportsModelPull: false,
      supportsContextWindowQuery: true,
    })
  })

  it('tgi and mlx-lm are managed externally', () => {
    for (const backend of ['tgi', 'mlx-lm'] as const) {
      expect(capabilitiesForBackend(backend).supportsModelPull).toBe(false)
      expect(capabilitiesForBackend(backend).supportsVramQuery).toBe(false)
    }
  })
})
