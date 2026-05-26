import { useState } from 'react'
import EditNoteIcon from '@mui/icons-material/EditNote'
import {
  Box,
  Chip,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Popover,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  formatSessionContextChip,
  formatTokenCount,
  sessionContextTooltip,
  type SessionContextUsage,
} from '../../utils/contextUsage'

export interface SessionContextChipProps {
  files: string[]
  usage: SessionContextUsage
  onOpenInEditor?: (path: string) => void
}

export function SessionContextChip({ files, usage, onOpenInEditor }: SessionContextChipProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const open = Boolean(anchorEl)
  const label = formatSessionContextChip(files.length, usage)
  const tooltip = sessionContextTooltip(files, usage)

  return (
    <>
      <Chip
        data-testid="session-context-chip"
        label={label}
        size="small"
        variant="outlined"
        clickable
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Session context: ${label}. Click to view files.`}
        title={open ? undefined : `${tooltip}\n\nClick for file list`}
        sx={{ cursor: 'pointer' }}
      />
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: { maxWidth: 480, maxHeight: 360, overflow: 'auto' },
          },
        }}
      >
        <Box data-testid="session-context-popover">
        <Typography variant="subtitle2" sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
          Files in context ({files.length})
        </Typography>
        {files.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 1.5 }}>
            Repo map only — use /add or the suggested-files tray to include paths.
          </Typography>
        ) : (
          <List dense disablePadding role="listbox" aria-label="Files in chat context">
            {files.map((path) => (
              <ListItem
                key={path}
                disablePadding
                sx={{ px: 2 }}
                secondaryAction={
                  onOpenInEditor ? (
                    <Tooltip title="Open in editor">
                      <IconButton
                        edge="end"
                        size="small"
                        aria-label={`Open ${path} in editor`}
                        onClick={() => {
                          onOpenInEditor(path)
                          setAnchorEl(null)
                        }}
                        data-testid={`context-open-editor-${path.replace(/\//g, '--')}`}
                      >
                        <EditNoteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : undefined
                }
              >
                <ListItemText
                  primary={path}
                  primaryTypographyProps={{
                    variant: 'body2',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    sx: { wordBreak: 'break-all' },
                  }}
                />
              </ListItem>
            ))}
          </List>
        )}
        {(usage.estimatedFromAdds > 0 || usage.lastReport) && (
          <>
            <Divider />
            <Typography variant="caption" color="text.secondary" component="div" sx={{ px: 2, py: 1 }}>
              {usage.lastReport ? usage.lastReport.raw : null}
              {usage.estimatedFromAdds > 0 && (
                <>
                  {usage.lastReport ? '\n' : ''}
                  Estimated from /add: ~{formatTokenCount(usage.estimatedFromAdds)} tokens
                </>
              )}
            </Typography>
          </>
        )}
        </Box>
      </Popover>
    </>
  )
}
