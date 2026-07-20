import { describe, expect, it } from 'vitest'
import { normalizeWorkspacePath, workspacePathsEqual } from './workspacePath'

describe('workspacePath', () => {
  it('normalizes slashes and trailing slashes', () => {
    expect(normalizeWorkspacePath('/Volumes/Code/foo/')).toBe('/Volumes/Code/foo')
    expect(normalizeWorkspacePath('C:\\repo\\')).toBe('C:/repo')
  })

  it('compares paths after normalization', () => {
    expect(workspacePathsEqual('/a/b/', '/a/b')).toBe(true)
    expect(workspacePathsEqual('/a/b', '/a/c')).toBe(false)
  })
})
