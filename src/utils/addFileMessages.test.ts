import { describe, expect, it } from 'vitest'
import {
  formatFilesNotAddedSnackbar,
  isLegacyGitignoreAddError,
  rewriteAddFileToolMessage,
  shortDisplayPath,
} from './addFileMessages'

describe('addFileMessages', () => {
  it('rewrites legacy gitignore add error', () => {
    const raw = "Can't add src/foo.tsx which is in gitignore"
    expect(isLegacyGitignoreAddError(raw)).toBe(true)
    const out = rewriteAddFileToolMessage(raw, '/Volumes/Code/bright-vision')
    expect(out).toContain('Could not add')
    expect(out).not.toContain('which is in gitignore')
    expect(out).toContain('bright-vision')
  })

  it('leaves unrelated tool errors unchanged', () => {
    const raw = 'Network timeout'
    expect(rewriteAddFileToolMessage(raw)).toBe(raw)
  })

  it('rewrites not-on-disk add errors', () => {
    const raw =
      'Not on disk: src/resolver.rs — create the file first or add an existing path to context.'
    const out = rewriteAddFileToolMessage(raw)
    expect(out).toContain('not on disk')
    expect(out).toContain('design outline')
  })

  it('formats not-added snackbar', () => {
    const msg = formatFilesNotAddedSnackbar(
      ['src/a.tsx', 'src/b.tsx'],
      '/Volumes/Code/bright-vision'
    )
    expect(msg).toContain('Not in context')
    expect(msg).toContain('Workspace')
  })

  it('shortens long paths', () => {
    expect(shortDisplayPath('src/components/chat/ChatPanel.tsx')).toBe(
      'src/components/chat/ChatPanel.tsx'
    )
    const long = 'a/'.repeat(40) + 'file.tsx'
    expect(shortDisplayPath(long)).toMatch(/^…\//)
  })
})
