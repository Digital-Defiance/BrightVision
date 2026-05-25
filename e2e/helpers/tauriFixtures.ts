import type {
  GitCommitDetail,
  GitCommitEntry,
  GitFileDiff,
  GitGraphNode,
  GitWorkspaceStatus,
} from '../../src/ipc/gitStatus'

export const E2E_GIT_STATUS: GitWorkspaceStatus = {
  is_repo: true,
  branch: 'e2e-main',
  ahead: 1,
  behind: 0,
  files: [
    { path: 'src/example.ts', index: 'M', worktree: ' ' },
    { path: 'README.md', index: ' ', worktree: 'M' },
  ],
  error: null,
}

export const E2E_GIT_DIFF: GitFileDiff = {
  text: '--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1 @@\n-old\n+new\n',
  truncated: false,
}

export const E2E_GIT_COMMITS: GitCommitEntry[] = [
  {
    hash: 'a'.repeat(40),
    short_hash: 'aaa1111',
    subject: 'e2e: initial commit',
    author: 'E2E Tester',
    timestamp: 1_700_000_000,
  },
]

export const E2E_GIT_GRAPH: GitGraphNode[] = [
  {
    hash: 'a'.repeat(40),
    short_hash: 'aaa1111',
    subject: 'e2e: initial commit',
    timestamp: 1_700_000_000,
    parents: [],
    is_merge: false,
  },
]

export const E2E_COMMIT_DETAIL: GitCommitDetail = {
  text: 'commit aaa1111\nAuthor: E2E\n\ne2e: initial commit\n',
  truncated: false,
}

export const E2E_PATH_SUGGESTIONS = ['src/App.tsx', 'src/utils/', 'docs/']
