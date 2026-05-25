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

  it('returns empty for missing models', () => {
    expect(rowsFromOllamaApiBody({})).toEqual([])
  })
})
