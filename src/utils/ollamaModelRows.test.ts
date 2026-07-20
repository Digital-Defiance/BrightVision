import { describe, expect, it } from 'vitest'
import { rowsFromOllamaApiBody } from './ollamaModelRows'

describe('rowsFromOllamaApiBody', () => {
  it('parses /api/ps models array', () => {
    const rows = rowsFromOllamaApiBody({
      models: [
        {
          name: 'qwen3.6:27b-q4_K_M',
          size_vram: 2_147_483_648,
          expires_at: '2026-05-25T20:00:00Z',
        },
      ],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('qwen3.6:27b-q4_K_M')
    expect(rows[0].vram).toContain('VRAM')
    expect(rows[0].expiresAt).toContain('2026')
  })

  it('parses lms ps --json array', () => {
    const rows = rowsFromOllamaApiBody([
      {
        type: 'llm',
        modelKey: 'google/gemma-4-26b-a4b-qat',
        identifier: 'google/gemma-4-26b-a4b-qat',
        sizeBytes: 15_641_332_573,
        selectedVariant: 'google/gemma-4-26b-a4b-qat@4bit',
        status: 'idle',
        parallel: 4,
        contextLength: 8192,
      },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('google/gemma-4-26b-a4b-qat')
    expect(rows[0].context).toBe(8192)
    expect(rows[0].processor).toBe('IDLE · parallel 4')
    expect(rows[0].expiresAt).toBe('google/gemma-4-26b-a4b-qat@4bit')
  })

  it('returns empty for missing models', () => {
    expect(rowsFromOllamaApiBody({})).toEqual([])
  })
})
