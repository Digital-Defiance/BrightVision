import { describe, expect, it } from 'vitest'
import { resolveSpecGeneratePrompt, truncatePromptPreview } from './specGeneratePrompt'

describe('resolveSpecGeneratePrompt', () => {
  it('uses draft text when present', () => {
    expect(resolveSpecGeneratePrompt('Add REQ-003 for offline', 'My task', 'generate')).toBe(
      'Add REQ-003 for offline'
    )
  })

  it('falls back to feature title for generate', () => {
    expect(resolveSpecGeneratePrompt('', 'Auth flow', 'generate')).toBe('Feature: Auth flow')
  })

  it('falls back to default refine prompt', () => {
    expect(resolveSpecGeneratePrompt('', 'Auth flow', 'refine')).toContain('EARS')
  })
})

describe('truncatePromptPreview', () => {
  it('truncates long prompts', () => {
    expect(truncatePromptPreview('a'.repeat(100), 20).endsWith('…')).toBe(true)
  })
})
