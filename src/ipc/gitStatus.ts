import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime } from './isTauri'

export interface GitFileEntry {
  path: string
  index: string
  worktree: string
}

export interface GitWorkspaceStatus {
  is_repo: boolean
  branch: string | null
  ahead: number
  behind: number
  files: GitFileEntry[]
  error: string | null
}

export function describeGitChange(index: string, worktree: string): string {
  if (index === '?' && worktree === '?') return 'untracked'
  const parts: string[] = []
  if (index !== ' ') parts.push(`staged ${index}`)
  if (worktree !== ' ') parts.push(`wt ${worktree}`)
  return parts.join(', ') || 'changed'
}

export async function fetchGitWorkspaceStatus(
  workingDir: string
): Promise<GitWorkspaceStatus | null> {
  if (!isTauriRuntime() || !workingDir.trim()) return null
  try {
    return await invoke<GitWorkspaceStatus>('git_workspace_status', { workingDir })
  } catch (err) {
    return {
      is_repo: false,
      branch: null,
      ahead: 0,
      behind: 0,
      files: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
