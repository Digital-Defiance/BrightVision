import { invoke } from '@tauri-apps/api/core'
import { shouldAutoStage, normalizeStagePaths } from '../utils/autoStagePolicy'
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

export interface GitFileDiff {
  text: string
  truncated: boolean
}

export interface GitCommitEntry {
  hash: string
  short_hash: string
  subject: string
  author: string
  timestamp: number
}

export interface GitGraphNode {
  hash: string
  short_hash: string
  subject: string
  timestamp: number
  parents: string[]
  is_merge: boolean
}

export interface GitCommitDetail {
  text: string
  truncated: boolean
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

export async function fetchGitFileDiff(
  workingDir: string,
  file: GitFileEntry
): Promise<GitFileDiff> {
  return invoke<GitFileDiff>('git_file_diff', {
    workingDir,
    path: file.path,
    index: file.index,
    worktree: file.worktree,
  })
}

export async function fetchGitRecentCommits(
  workingDir: string,
  limit = 20
): Promise<GitCommitEntry[]> {
  return invoke<GitCommitEntry[]>('git_recent_commits', { workingDir, limit })
}

export async function fetchGitCommitGraph(
  workingDir: string,
  limit = 25
): Promise<GitGraphNode[]> {
  return invoke<GitGraphNode[]>('git_commit_graph', { workingDir, limit })
}

export async function fetchGitCommitDetail(
  workingDir: string,
  hash: string
): Promise<GitCommitDetail> {
  return invoke<GitCommitDetail>('git_commit_detail', { workingDir, hash })
}

export async function gitStagePaths(
  workingDir: string,
  paths?: string[]
): Promise<void> {
  await invoke('git_stage_paths', { workingDir, paths: paths ?? null })
}

/** Revert tracked changes to HEAD and remove untracked paths from the worktree. */
export async function gitRestoreWorktreePaths(
  workingDir: string,
  paths: string[]
): Promise<void> {
  await invoke('git_restore_worktree_paths', { workingDir, paths })
}

/** Stage agent-edited paths when manual commit mode left them unstaged. */
export async function autoStageEditedFiles(
  workingDir: string,
  editedFiles: string[],
  options: { enabled: boolean; engineCommitted: boolean }
): Promise<number> {
  if (
    !shouldAutoStage({
      enabled: options.enabled,
      engineCommitted: options.engineCommitted,
      isTauri: isTauriRuntime(),
      workingDir,
      editedFiles,
    })
  ) {
    return 0
  }
  const paths = normalizeStagePaths(editedFiles)
  await gitStagePaths(workingDir, paths)
  return paths.length
}
