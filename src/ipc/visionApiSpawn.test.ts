import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './config'
import { visionApiBaseUrl } from './visionApiSpawn'

describe('visionApiBaseUrl', () => {
  it('uses config URL when set', () => {
    expect(visionApiBaseUrl({ ...DEFAULT_CONFIG, coreApiUrl: 'http://127.0.0.1:8741/' })).toBe(
      'http://127.0.0.1:8741'
    )
  })

  it('defaults to :8741', () => {
    expect(visionApiBaseUrl({ ...DEFAULT_CONFIG, coreApiUrl: '' })).toBe(
      'http://127.0.0.1:8741'
    )
  })
})
