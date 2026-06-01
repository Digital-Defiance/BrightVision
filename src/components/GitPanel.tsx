import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import RefreshIcon from '@mui/icons-material/Refresh'
import UndoIcon from '@mui/icons-material/Undo'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import type { GitActivity } from '../hooks/useSessionActivity'
import {
  describeGitChange,
  fetchGitCommitDetail,
  fetchGitCommitGraph,
  fetchGitFileDiff,
  fetchGitRecentCommits,
  gitStagePaths,
  type GitCommitEntry,
  type GitFileEntry,
  type GitGraphNode,
  type GitWorkspaceStatus,
} from '../ipc/gitStatus'
import { isTauriRuntime } from '../ipc/isTauri'
import { GitCommitGraph } from './GitCommitGraph'

interface GitPanelProps {
  workingDir: string
  lastGit: GitActivity | null
  gitStatus: GitWorkspaceStatus | null
  gitLoading: boolean
  onRefreshGit: () => void
  onUndo?: () => void
  onOpenInEditor?: (path: string) => void
  onRevertFile?: (path: string) => void | Promise<void>
  isRunning: boolean
  refreshToken?: number
}

function statusColor(index: string, worktree: string): string {
  if (index === '?' && worktree === '?') return 'text.secondary'
  if (index === 'D' || worktree === 'D') return 'error.light'
  if (index !== ' ') return 'success.light'
  if (worktree === 'M' || worktree === 'U') return 'warning.light'
  return 'text.primary'
}

function formatCommitTime(ts: number): string {
  if (!ts) return ''
  try {
    return new Date(ts * 1000).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function DiffPre({ text, truncated }: { text: string; truncated: boolean }) {
  if (!text.trim()) {
    return (
      <Typography variant="caption" color="text.secondary">
        No diff (binary or unchanged vs index).
      </Typography>
    )
  }
  return (
    <>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1,
          borderRadius: 1,
          bgcolor: 'action.hover',
          fontFamily: 'monospace',
          fontSize: '0.68rem',
          lineHeight: 1.35,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 280,
          overflow: 'auto',
        }}
      >
        {text}
      </Box>
      {truncated && (
        <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: 'block' }}>
          Diff truncated for display.
        </Typography>
      )}
    </>
  )
}

function GitFileRow({
  file,
  workingDir,
  expanded,
  onToggle,
  onStaged,
  onOpenInEditor,
  onRevertFile,
}: {
  file: GitFileEntry
  workingDir: string
  expanded: boolean
  onToggle: () => void
  onStaged: () => void
  onOpenInEditor?: (path: string) => void
  onRevertFile?: (path: string) => void | Promise<void>
}) {
  const [diff, setDiff] = useState<{ text: string; truncated: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const [staging, setStaging] = useState(false)
  const [reverting, setReverting] = useState(false)
  const label = describeGitChange(file.index, file.worktree)
  const canStage = file.index === ' ' || file.worktree !== ' '
  const canRevert = true

  useEffect(() => {
    if (!expanded) return
    let cancelled = false
    setLoading(true)
    setDiff(null)
    void fetchGitFileDiff(workingDir, file)
      .then((d) => {
        if (!cancelled) setDiff(d)
      })
      .catch((err) => {
        if (!cancelled) {
          setDiff({
            text: err instanceof Error ? err.message : String(err),
            truncated: false,
          })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [expanded, workingDir, file.path, file.index, file.worktree])

  const handleStage = async (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    setStaging(true)
    try {
      await gitStagePaths(workingDir, [file.path])
      onStaged()
    } finally {
      setStaging(false)
    }
  }

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Stack
        direction="row"
        spacing={0.5}
        alignItems="center"
        onClick={onToggle}
        sx={{
          py: 0.5,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
          borderRadius: 0.5,
        }}
      >
        <ExpandMoreIcon
          fontSize="small"
          sx={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
            opacity: 0.6,
          }}
        />
        <Box
          sx={{
            flexGrow: 1,
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            color: statusColor(file.index, file.worktree),
          }}
        >
          <Box component="span" sx={{ minWidth: 88, opacity: 0.75, mr: 1 }}>
            {label}
          </Box>
          <Box component="span" sx={{ wordBreak: 'break-all' }}>
            {file.path}
          </Box>
        </Box>
        {onOpenInEditor && (
          <Tooltip title="Open in editor">
            <IconButton
              size="small"
              aria-label={`Open ${file.path} in editor`}
              onClick={(e) => {
                e.stopPropagation()
                onOpenInEditor(file.path)
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {canRevert && onRevertFile && (
          <Tooltip title="Revert file (discard local changes)">
            <span>
              <IconButton
                size="small"
                aria-label={`Revert ${file.path}`}
                disabled={reverting}
                onClick={(e) => {
                  e.stopPropagation()
                  setReverting(true)
                  void Promise.resolve(onRevertFile(file.path)).finally(() =>
                    setReverting(false)
                  )
                }}
              >
                {reverting ? <CircularProgress size={16} /> : <UndoIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        )}
        {canStage && (
          <Tooltip title="Stage file">
            <span>
              <IconButton
                size="small"
                aria-label={`Stage ${file.path}`}
                disabled={staging}
                onClick={(e) => void handleStage(e)}
              >
                {staging ? <CircularProgress size={16} /> : <AddIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Stack>
      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ pl: 3, pr: 1, pb: 1 }}>
          {loading && <CircularProgress size={20} />}
          {!loading && diff && <DiffPre text={diff.text} truncated={diff.truncated} />}
        </Box>
      </Collapse>
    </Box>
  )
}

function CommitRow({
  commit,
  workingDir,
  expanded,
  onToggle,
}: {
  commit: GitCommitEntry
  workingDir: string
  expanded: boolean
  onToggle: () => void
}) {
  const [detail, setDetail] = useState<{ text: string; truncated: boolean } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!expanded) return
    let cancelled = false
    setLoading(true)
    setDetail(null)
    void fetchGitCommitDetail(workingDir, commit.hash)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((err) => {
        if (!cancelled) {
          setDetail({
            text: err instanceof Error ? err.message : String(err),
            truncated: false,
          })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [expanded, workingDir, commit.hash])

  return (
    <Accordion
      expanded={expanded}
      onChange={() => onToggle()}
      disableGutters
      elevation={0}
      sx={{
        bgcolor: 'transparent',
        '&:before': { display: 'none' },
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />} sx={{ minHeight: 40 }}>
        <Stack direction="row" spacing={1} alignItems="baseline" width="100%" pr={1}>
          <Typography
            variant="caption"
            sx={{ fontFamily: 'monospace', color: 'primary.light', flexShrink: 0 }}
          >
            {commit.short_hash}
          </Typography>
          <Typography variant="body2" sx={{ flexGrow: 1, wordBreak: 'break-word' }}>
            {commit.subject}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
            {formatCommitTime(commit.timestamp)}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
          {commit.author}
        </Typography>
        {loading && <CircularProgress size={20} />}
        {!loading && detail && <DiffPre text={detail.text} truncated={detail.truncated} />}
      </AccordionDetails>
    </Accordion>
  )
}

export function GitPanel({
  workingDir,
  lastGit,
  gitStatus,
  gitLoading,
  onRefreshGit,
  onUndo,
  onOpenInEditor,
  onRevertFile,
  isRunning,
  refreshToken = 0,
}: GitPanelProps) {
  const [expandedFile, setExpandedFile] = useState<string | null>(null)
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null)
  const [commits, setCommits] = useState<GitCommitEntry[]>([])
  const [graphNodes, setGraphNodes] = useState<GitGraphNode[]>([])
  const [commitsLoading, setCommitsLoading] = useState(false)
  const [stagingAll, setStagingAll] = useState(false)

  const hasAgentActivity = lastGit && (lastGit.commitHash || lastGit.editedFiles.length > 0)

  const loadCommits = useCallback(async () => {
    if (!isTauriRuntime() || !workingDir.trim() || !gitStatus?.is_repo) {
      setCommits([])
      setGraphNodes([])
      return
    }
    setCommitsLoading(true)
    try {
      const [list, graph] = await Promise.all([
        fetchGitRecentCommits(workingDir, 25),
        fetchGitCommitGraph(workingDir, 25),
      ])
      setCommits(list)
      setGraphNodes(graph)
    } catch {
      setCommits([])
      setGraphNodes([])
    } finally {
      setCommitsLoading(false)
    }
  }, [workingDir, gitStatus?.is_repo])

  useEffect(() => {
    void loadCommits()
  }, [loadCommits, refreshToken])

  const handleStageAll = async () => {
    setStagingAll(true)
    try {
      await gitStagePaths(workingDir)
      onRefreshGit()
    } finally {
      setStagingAll(false)
    }
  }

  return (
    <Stack spacing={2} width="100%" maxWidth={800} sx={{ mx: 'auto' }} data-testid="git-panel">
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ flexGrow: 1 }}>
            Working tree
          </Typography>
          {isTauriRuntime() && gitStatus?.is_repo && gitStatus.files.length > 0 && (
            <Button
              data-testid="git-stage-all"
              size="small"
              variant="outlined"
              disabled={stagingAll || gitLoading}
              onClick={() => void handleStageAll()}
            >
              {stagingAll ? 'Staging…' : 'Stage all'}
            </Button>
          )}
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
          <Typography variant="body2" color="text.secondary" data-testid="git-panel-web-hint">
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
              <Box sx={{ maxHeight: 420, overflow: 'auto', pr: 0.5 }}>
                {gitStatus.files.map((f) => (
                  <GitFileRow
                    key={`${f.path}-${f.index}-${f.worktree}`}
                    file={f}
                    workingDir={workingDir}
                    expanded={expandedFile === f.path}
                    onToggle={() =>
                      setExpandedFile((prev) => (prev === f.path ? null : f.path))
                    }
                    onStaged={onRefreshGit}
                    onOpenInEditor={onOpenInEditor}
                    onRevertFile={onRevertFile}
                  />
                ))}
              </Box>
            )}
          </>
        )}
      </Paper>

      {isTauriRuntime() && gitStatus?.is_repo && !gitStatus.error && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ flexGrow: 1 }}>
              Commit history
            </Typography>
            {commitsLoading && <CircularProgress size={18} />}
          </Stack>
          {graphNodes.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <GitCommitGraph
                nodes={graphNodes}
                selectedHash={expandedCommit}
                onSelect={(hash) =>
                  setExpandedCommit((prev) => (prev === hash ? null : hash))
                }
              />
            </Box>
          )}
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Details
          </Typography>
          {commits.length === 0 && !commitsLoading ? (
            <Typography variant="body2" color="text.secondary">
              No commits in this repository yet.
            </Typography>
          ) : (
            <Box sx={{ maxHeight: 360, overflow: 'auto' }}>
              {commits.map((c) => (
                <CommitRow
                  key={c.hash}
                  commit={c}
                  workingDir={workingDir}
                  expanded={expandedCommit === c.hash}
                  onToggle={() =>
                    setExpandedCommit((prev) => (prev === c.hash ? null : c.hash))
                  }
                />
              ))}
            </Box>
          )}
        </Paper>
      )}

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
