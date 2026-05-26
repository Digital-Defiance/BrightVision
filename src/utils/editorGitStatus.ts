import type { GitFileEntry } from '../ipc/gitStatus'

/** Short git badge for explorer rows (staged / worktree). */
export type EditorGitBadge = 'M' | 'A' | 'D' | '?' | 'U' | 'R'

export function gitEntryBadge(entry: GitFileEntry): EditorGitBadge | null {
  if (entry.index === '?' && entry.worktree === '?') return '?'
  const wt = entry.worktree.trim()
  const idx = entry.index.trim()
  if (wt === 'U' || idx === 'U') return 'U'
  if (wt === 'D' || idx === 'D') return 'D'
  if (wt === 'A' || idx === 'A') return 'A'
  if (wt === 'R' || idx === 'R') return 'R'
  if (wt === 'M' || idx === 'M') return 'M'
  return null
}

export function buildGitStatusByPath(files: GitFileEntry[]): Map<string, EditorGitBadge> {
  const map = new Map<string, EditorGitBadge>()
  for (const f of files) {
    const badge = gitEntryBadge(f)
    if (badge) map.set(f.path.replace(/\\/g, '/'), badge)
  }
  return map
}

export function gitBadgeColor(badge: EditorGitBadge): string {
  switch (badge) {
    case '?':
      return 'info.main'
    case 'A':
      return 'success.main'
    case 'D':
      return 'error.main'
    case 'U':
      return 'error.light'
    default:
      return 'warning.main'
  }
}
