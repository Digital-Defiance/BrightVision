import { useState } from 'react'
import CloseIcon from '@mui/icons-material/Close'
import {
  Box,
  Button,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Popover,
  Tooltip,
  Typography,
} from '@mui/material'
import { formatQueueChipLabel, formatQueuePreview } from '../../utils/messageQueue'

export interface MessageQueueChipProps {
  messages: string[]
  onRemoveAt: (index: number) => void
  onClearAll: () => void
}

export function MessageQueueChip({ messages, onRemoveAt, onClearAll }: MessageQueueChipProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const open = Boolean(anchorEl)
  const count = messages.length
  if (count === 0) return null

  const label = formatQueueChipLabel(count)

  return (
    <>
      <Chip
        data-testid="message-queue-chip"
        label={label}
        size="small"
        color="info"
        variant="outlined"
        clickable
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}. Click to view or remove queued messages.`}
        title={open ? undefined : 'Waiting for the current turn to finish. Click to view queue.'}
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
            sx: { maxWidth: 520, maxHeight: 400, overflow: 'auto' },
          },
        }}
      >
        <Box data-testid="message-queue-popover">
          <Typography variant="subtitle2" sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
            Queued messages ({count})
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ px: 2, pb: 1, display: 'block' }}>
            These send after the current turn completes. They are not in the chat yet.
          </Typography>
          <List dense disablePadding aria-label="Queued messages">
            {messages.map((text, index) => (
              <ListItem
                key={`${index}-${formatQueuePreview(text, 24)}`}
                disablePadding
                sx={{ px: 2, alignItems: 'flex-start' }}
                secondaryAction={
                  <Tooltip title="Remove from queue">
                    <IconButton
                      edge="end"
                      size="small"
                      aria-label={`Remove queued message ${index + 1}`}
                      data-testid={`message-queue-remove-${index}`}
                      onClick={() => {
                        onRemoveAt(index)
                        if (messages.length <= 1) setAnchorEl(null)
                      }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                }
              >
                <ListItemText
                  primary={
                    <Typography component="span" variant="caption" color="text.secondary">
                      #{index + 1}
                    </Typography>
                  }
                  secondary={
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        display: 'block',
                        mt: 0.25,
                        pr: 4,
                      }}
                    >
                      {text}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
          <Box sx={{ px: 2, pb: 1.5, pt: 0.5, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              size="small"
              color="inherit"
              data-testid="message-queue-clear-all"
              onClick={() => {
                onClearAll()
                setAnchorEl(null)
              }}
            >
              Clear all
            </Button>
          </Box>
        </Box>
      </Popover>
    </>
  )
}
