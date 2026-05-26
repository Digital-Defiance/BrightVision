import { describe, expect, it } from 'vitest'
import {
  matchOptionalEditorPlugin,
  sanitizeEnabledOptionalPluginIds,
} from './languageRegistry'

describe('languageRegistry', () => {
  it('sanitizes unknown plugin ids', () => {
    expect(sanitizeEnabledOptionalPluginIds(['cpp', 'evil', 'java', 'cpp'])).toEqual([
      'cpp',
      'java',
    ])
  })

  it('matches extension and Dockerfile basename', () => {
    const enabled = new Set(['cpp', 'dockerfile'])
    expect(matchOptionalEditorPlugin('src/main.cpp', enabled)).toBe('cpp')
    expect(matchOptionalEditorPlugin('Dockerfile', enabled)).toBe('dockerfile')
    expect(matchOptionalEditorPlugin('src/App.tsx', enabled)).toBeNull()
  })
})
