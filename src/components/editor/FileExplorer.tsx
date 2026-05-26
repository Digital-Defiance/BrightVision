import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined'
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined'
import RefreshIcon from '@mui/icons-material/Refresh'
import {
  Box,
  CircularProgress,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { listWorkspaceFiles } from '../../ipc/workspaceEditor'
import { isTauriRuntime } from '../../ipc/isTauri'
import { buildFileTree, filterFileTree, type FileTreeNode } from '../../utils/fileTree'
import {
  gitBadgeColor,
  type EditorGitBadge,
} from '../../utils/editorGitStatus'

interface FileExplorerProps {
  workingDir: string
  activePath: string | null
  onOpenFile: (path: string) => void
  gitStatusByPath?: Map<string, EditorGitBadge>
}

function TreeRows({
  nodes,
  depth,
  expanded,
  onToggle,
  activePath,
  onOpenFile,
  gitStatusByPath,
}: {
  nodes: FileTreeNode[]
  depth: number
  expanded: Set<string>
  onToggle: (dirPath: string) => void
  activePath: string | null
  onOpenFile: (path: string) => void
  gitStatusByPath?: Map<string, EditorGitBadge>
}) {
  return (
    <>
      {nodes.map((node) => {
        const pad = 1 + depth * 1.5
        if (node.isDir) {
          const open = expanded.has(node.path)
          return (
            <Box key={`dir-${node.path}`}>
              <ListItemButton
                dense
                sx={{ pl: pad }}
                onClick={() => onToggle(node.path)}
                data-testid={`explorer-dir-${node.path}`}
              >
                <ListItemIcon sx={{ minWidth: 28 }}>
                  {open ? (
                    <ExpandMoreIcon fontSize="small" />
                  ) : (
                    <ChevronRightIcon fontSize="small" />
                  )}
                </ListItemIcon>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <FolderOutlinedIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={node.name}
                  primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                />
              </ListItemButton>
              {open && node.children?.length ? (
                <TreeRows
                  nodes={node.children}
                  depth={depth + 1}
                  expanded={expanded}
                  onToggle={onToggle}
                  activePath={activePath}
                  onOpenFile={onOpenFile}
                  gitStatusByPath={gitStatusByPath}
                />
              ) : null}
            </Box>
          )
        }
        const badge = gitStatusByPath?.get(node.path)
        return (
          <ListItemButton
            key={node.path}
            dense
            selected={activePath === node.path}
            sx={{ pl: pad + 3.5 }}
            onClick={() => onOpenFile(node.path)}
            data-testid={`explorer-file-${node.path}`}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>
              <InsertDriveFileOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={node.name}
              primaryTypographyProps={{ variant: 'body2', noWrap: true }}
            />
            {badge ? (
              <Typography
                component="span"
                variant="caption"
                sx={{
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  color: gitBadgeColor(badge),
                  ml: 0.5,
                  flexShrink: 0,
                }}
                title={`Git: ${badge}`}
                data-testid={`explorer-git-${node.path}`}
              >
                {badge}
              </Typography>
            ) : null}
          </ListItemButton>
        )
      })}
    </>
  )
}

export function FileExplorer({
  workingDir,
  activePath,
  onOpenFile,
  gitStatusByPath,
}: FileExplorerProps) {
  const [paths, setPaths] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['src']))

  const refresh = useCallback(async () => {
    if (!isTauriRuntime()) {
      setError('File explorer requires the desktop app')
      setPaths([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const files = await listWorkspaceFiles(workingDir)
      setPaths(files)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setPaths([])
    } finally {
      setLoading(false)
    }
  }, [workingDir])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const tree = useMemo(() => filterFileTree(buildFileTree(paths), filter), [paths, filter])

  const onToggle = useCallback((dirPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(dirPath)) next.delete(dirPath)
      else next.add(dirPath)
      return next
    })
  }, [])

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        bgcolor: 'background.paper',
        borderLeft: 1,
        borderColor: 'divider',
      }}
      data-testid="editor-file-explorer"
    >
      <Box
        sx={{
          px: 1,
          py: 0.75,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="caption" fontWeight={600} sx={{ flex: 1 }}>
          Explorer
        </Typography>
        <Tooltip title="Refresh">
          <span>
            <IconButton size="small" onClick={() => void refresh()} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <Box sx={{ px: 1, py: 0.75 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Filter files…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          inputProps={{ 'data-testid': 'editor-explorer-filter' }}
        />
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={22} />
          </Box>
        )}
        {error && (
          <Typography variant="body2" color="warning.main" sx={{ px: 1.5, py: 1 }}>
            {error}
          </Typography>
        )}
        {!loading && !error && tree.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 1 }}>
            No files listed.
          </Typography>
        )}
        <List dense disablePadding>
          <TreeRows
            nodes={tree}
            depth={0}
            expanded={expanded}
            onToggle={onToggle}
            activePath={activePath}
            onOpenFile={onOpenFile}
            gitStatusByPath={gitStatusByPath}
          />
        </List>
      </Box>
    </Box>
  )
}
