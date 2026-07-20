import SignpostOutlinedIcon from '@mui/icons-material/SignpostOutlined'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import type { CoreHttpClient } from '../../ipc/httpClient'
import type { SteeringFilesResult } from '@brightvision/vision-client'

const STEERING_MAIN = '.cecli/STEERING.md'

export interface SteeringFilesHintProps {
  workspace: string
  client: CoreHttpClient | null
  httpReady?: boolean
  onOpenInEditor?: (path: string) => void
  onNotify?: (message: string, severity: 'info' | 'warning' | 'error') => void
}

export function SteeringFilesHint({
  workspace,
  client,
  httpReady = false,
  onOpenInEditor,
  onNotify,
}: SteeringFilesHintProps) {
  const [snapshot, setSnapshot] = useState<SteeringFilesResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [scaffolding, setScaffolding] = useState(false)

  const reload = useCallback(async () => {
    if (!client || !httpReady || !workspace.trim()) {
      setSnapshot(null)
      return
    }
    setLoading(true)
    try {
      const data = await client.getWorkspaceSteeringFiles(workspace)
      setSnapshot(data)
    } catch (err) {
      setSnapshot(null)
      onNotify?.(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [client, httpReady, workspace, onNotify])

  useEffect(() => {
    void reload()
  }, [reload])

  const openPath = (relpath: string) => {
    if (!onOpenInEditor) {
      onNotify?.('Open in editor requires the desktop app', 'info')
      return
    }
    onOpenInEditor(relpath)
  }

  const handleScaffold = async () => {
    if (!client || !httpReady) return
    setScaffolding(true)
    try {
      const data = await client.scaffoldWorkspaceSteeringFiles(workspace)
      setSnapshot(data)
      if (data.created.length) {
        onNotify?.('Created project steering template', 'info')
        if (onOpenInEditor) onOpenInEditor(STEERING_MAIN)
      } else {
        onNotify?.('Steering file already exists', 'info')
      }
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setScaffolding(false)
    }
  }

  if (!httpReady || !client) return null

  const summary = snapshot?.has_content
    ? `${snapshot.file_count} steering file(s) injected on spec-focus / generate-spec turns`
    : snapshot?.main
      ? 'STEERING.md is empty — add rules or use Create template'
      : 'No project steering yet — optional but recommended for spec sessions'

  return (
    <Box
      data-testid="steering-files-hint"
      sx={{
        px: 1.5,
        py: 1,
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'action.hover',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.75 }}>
        <SignpostOutlinedIcon fontSize="small" color="action" aria-hidden />
        <Typography variant="subtitle2">Project steering</Typography>
        {loading ? <CircularProgress size={14} aria-label="Loading steering files" /> : null}
        {snapshot?.has_content ? (
          <Chip size="small" color="success" label="Active" data-testid="steering-status-active" />
        ) : (
          <Chip size="small" color="warning" label="Missing" data-testid="steering-status-missing" />
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
        {summary}. Files: <Box component="code">{STEERING_MAIN}</Box>
        {snapshot?.fragments.length ? ' and .cecli/steering/*.md' : ''}.
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button
          size="small"
          variant="outlined"
          disabled={!snapshot?.main}
          onClick={() => openPath(STEERING_MAIN)}
          data-testid="steering-open-main"
        >
          Open STEERING.md
        </Button>
        {!snapshot?.main ? (
          <Button
            size="small"
            variant="contained"
            disabled={scaffolding}
            onClick={() => void handleScaffold()}
            data-testid="steering-scaffold"
          >
            Create template
          </Button>
        ) : null}
        {snapshot?.fragments.map((fragment) => (
          <Tooltip key={fragment.relpath} title={fragment.nonempty ? fragment.relpath : 'Empty file'}>
            <span>
              <Button
                size="small"
                variant="text"
                disabled={!fragment.nonempty || !onOpenInEditor}
                onClick={() => openPath(fragment.relpath)}
              >
                {fragment.relpath.split('/').pop()}
              </Button>
            </span>
          </Tooltip>
        ))}
      </Stack>
    </Box>
  )
}
