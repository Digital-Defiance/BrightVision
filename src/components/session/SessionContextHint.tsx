import AttachFileIcon from '@mui/icons-material/AttachFile'
import ArticleIcon from '@mui/icons-material/Article'
import {
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import type { SessionContextUsage } from '../../utils/contextUsage'
import { SessionContextChip } from './SessionContextChip'

export interface SessionContextHintProps {
  contextFiles: string[]
  contextUsage: SessionContextUsage
  sessionReady?: boolean
  /** Tasks tab: path field + Add. Spec tab uses prompt `/add` instead. */
  showPathField?: boolean
  onOpenSpec?: () => void
  onAddPath?: (path: string) => void | Promise<void>
  onOpenInEditor?: (path: string) => void
}

/** Surfaces session file context for spec generate/refine outside the Chat tab. */
export function SessionContextHint({
  contextFiles,
  contextUsage,
  sessionReady = false,
  showPathField = true,
  onOpenSpec,
  onAddPath,
  onOpenInEditor,
}: SessionContextHintProps) {
  const [pathDraft, setPathDraft] = useState('')

  const submitPath = () => {
    const path = pathDraft.trim()
    if (!path || !onAddPath) return
    setPathDraft('')
    void onAddPath(path)
  }

  return (
    <Box
      data-testid="session-context-hint"
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
        <AttachFileIcon fontSize="small" color="action" aria-hidden />
        <Typography variant="subtitle2">Generate context</Typography>
        <SessionContextChip files={contextFiles} usage={contextUsage} onOpenInEditor={onOpenInEditor} />
        {onOpenSpec && (
          <Button
            size="small"
            startIcon={<ArticleIcon fontSize="small" />}
            onClick={onOpenSpec}
            data-testid="context-open-spec"
          >
            Open Spec
          </Button>
        )}
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {contextFiles.length > 0
          ? `${contextFiles.length} file(s) in session — included in Generate / Refine on this task.`
          : 'No files attached yet. Add workspace paths to steer spec generation.'}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
        {showPathField ? (
          <>
            Type <Box component="code">/add src/path</Box> in the <strong>Spec</strong> prompt (Tab completes
            paths on desktop), or enter a path below.
          </>
        ) : (
          <>
            Use the Spec prompt below: <Box component="code">/add src/path</Box> then Enter (Tab on desktop).
          </>
        )}
      </Typography>
      {showPathField && onAddPath && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }} useFlexGap>
          <TextField
            size="small"
            fullWidth
            label="Workspace path"
            placeholder="src/components/Foo.tsx"
            value={pathDraft}
            disabled={!sessionReady}
            inputProps={{ 'data-testid': 'context-add-path-input' }}
            onChange={(e) => setPathDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitPath()
              }
            }}
          />
          <Button
            size="small"
            variant="outlined"
            disabled={!sessionReady || !pathDraft.trim()}
            onClick={submitPath}
            data-testid="context-add-path-btn"
          >
            Add
          </Button>
        </Stack>
      )}
    </Box>
  )
}
