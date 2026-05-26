import { describe, expect, it } from 'vitest'
import { buildGitStatusByPath, gitEntryBadge } from './editorGitStatus'

describe('editorGitStatus', () => {
  it('maps untracked and modified entries', () => {
    expect(gitEntryBadge({ path: 'new.ts', index: '?', worktree: '?' })).toBe('?')
    expect(gitEntryBadge({ path: 'src/a.ts', index: 'M', worktree: ' ' })).toBe('M')
    expect(gitEntryBadge({ path: 'b.ts', index: ' ', worktree: 'M' })).toBe('M')
  })

  it('buildGitStatusByPath normalizes paths', () => {
    const map = buildGitStatusByPath([
      { path: 'src\\foo.ts', index: 'M', worktree: ' ' },
    ])
    expect(map.get('src/foo.ts')).toBe('M')
  })
})
