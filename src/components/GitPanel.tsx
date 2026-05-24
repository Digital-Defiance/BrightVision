import RefreshIcon from '@mui/icons-material/Refresh'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import type { GitActivity } from '../hooks/useSessionActivity'
import { describeGitChange, type GitFileEntry, type GitWorkspaceStatus } from '../ipc/gitStatus'
import { isTauriRuntime } from '../ipc/isTauri'

interface GitPanelProps {
  lastGit: GitActivity | null
  gitStatus: GitWorkspaceStatus | null
  gitLoading: boolean
  onRefreshGit: () => void
  onUndo?: () => void
  isRunning: boolean
}

function statusColor(index: string, worktree: string): string {
  if (index === '?' && worktree === '?') return 'text.secondary'
  if (index === 'D' || worktree === 'D') return 'error.light'
  if (index !== ' ') return 'success.light'
  if (worktree === 'M' || worktree === 'U') return 'warning.light'
  return 'text.primary'
}

function FileRow({ file }: { file: GitFileEntry }) {
  const label = describeGitChange(file.index, file.worktree)
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="baseline"
      sx={{
        py: 0.35,
        fontFamily: 'monospace',
        fontSize: '0.75rem',
        color: statusColor(file.index, file.worktree),
      }}
    >
      <Box component="span" sx={{ minWidth: 88, opacity: 0.75 }}>
        {label}
      </Box>
      <Box component="span" sx={{ wordBreak: 'break-all' }}>
        {file.path}
      </Box>
    </Stack>
  )
}

export function GitPanel({
  lastGit,
  gitStatus,
  gitLoading,
  onRefreshGit,
  onUndo,
  isRunning,
}: GitPanelProps) {
  const hasAgentActivity = lastGit && (lastGit.commitHash || lastGit.editedFiles.length > 0)

  return (
    <Stack spacing={2} width="100%" maxWidth={720} sx={{ mx: 'auto' }}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ flexGrow: 1 }}>
            Working tree
          </Typography>
          {isTauriRuntime() && (
            <Tooltip title="Refresh git status">
              <span>
                <IconButton size="small" onClick={onRefreshGit} disabled={gitLoading}>
                  {gitLoading ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Stack>

        {!isTauriRuntime() && (
          <Typography variant="body2" color="text.secondary">
            Git status is available in the desktop app.
          </Typography>
        )}

        {isTauriRuntime() && gitStatus?.error && (
          <Typography variant="body2" color="warning.main">
            {gitStatus.error}
          </Typography>
        )}

        {isTauriRuntime() && gitStatus?.is_repo && !gitStatus.error && (
          <>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
              {gitStatus.branch && (
                <Chip label={gitStatus.branch} size="small" variant="outlined" color="primary" />
              )}
              {gitStatus.ahead > 0 && (
                <Chip label={`↑${gitStatus.ahead}`} size="small" variant="outlined" />
              )}
              {gitStatus.behind > 0 && (
                <Chip label={`↓${gitStatus.behind}`} size="small" variant="outlined" />
              )}
              <Chip
                label={
                  gitStatus.files.length === 0
                    ? 'clean'
                    : `${gitStatus.files.length} change${gitStatus.files.length === 1 ? '' : 's'}`
                }
                size="small"
                color={gitStatus.files.length === 0 ? 'success' : 'warning'}
                variant="outlined"
              />
            </Stack>

            {gitStatus.files.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No uncommitted changes in the project workspace.
              </Typography>
            ) : (
              <Box sx={{ maxHeight: 320, overflow: 'auto', pr: 0.5 }}>
                {gitStatus.files.map((f) => (
                  <FileRow key={`${f.path}-${f.index}-${f.worktree}`} file={f} />
                ))}
              </Box>
            )}
          </>
        )}
      </Paper>

      {hasAgentActivity && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Last agent turn
          </Typography>
          {lastGit!.commitHash && (
            <Typography
              variant="body2"
              sx={{ fontFamily: 'monospace', color: 'success.light', mb: 1 }}
            >
              {lastGit!.commitHash}
              {lastGit!.commitMessage ? ` — ${lastGit!.commitMessage}` : ''}
            </Typography>
          )}
          {lastGit!.editedFiles.length > 0 && (
            <Box
              component="ul"
              sx={{
                m: 0,
                pl: 2,
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: 'text.secondary',
              }}
            >
              {lastGit!.editedFiles.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </Box>
          )}
        </Paper>
      )}

      {!hasAgentActivity && isTauriRuntime() && gitStatus?.is_repo && (
        <Typography variant="body2" color="text.secondary" textAlign="center">
          Agent commits and edits from the last turn will appear below the working tree.
        </Typography>
      )}

      {onUndo && (
        <Button variant="outlined" onClick={onUndo} disabled={!isRunning}>
          Undo last agent commit
        </Button>
      )}
    </Stack>
  )
}
