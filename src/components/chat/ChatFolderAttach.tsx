import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Tooltip,
} from '@mui/material'
import { useState } from 'react'

interface ChatFolderAttachProps {
  disabled?: boolean
  /** Desktop: native folder picker (Tauri). */
  useNativePicker?: boolean
  onNativePick?: () => void
  /** Web: add a workspace-relative directory via `/add`-style API paths. */
  onAddFolderPath?: (relativePath: string) => void
}

export function ChatFolderAttach({
  disabled,
  useNativePicker,
  onNativePick,
  onAddFolderPath,
}: ChatFolderAttachProps) {
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState('')

  const handleSubmit = () => {
    const trimmed = path.trim()
    if (!trimmed) return
    onAddFolderPath?.(trimmed)
    setPath('')
    setOpen(false)
  }

  return (
    <>
      <Tooltip
        title={
          useNativePicker
            ? 'Add folder to session context'
            : 'Add folder path to context (relative to workspace)'
        }
      >
        <span>
          <IconButton
            size="small"
            aria-label="Add folder to context"
            disabled={disabled}
            onClick={() => {
              if (useNativePicker && onNativePick) {
                onNativePick()
              } else {
                setOpen(true)
              }
            }}
            sx={{ alignSelf: 'flex-end', mb: 0.5 }}
          >
            <FolderOpenIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      {!useNativePicker && onAddFolderPath && (
        <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Add folder to context</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Path relative to workspace"
              placeholder="e.g. src/components"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit()
              }}
              helperText="Same as typing /add path in chat. Core must reach this path on disk."
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleSubmit} disabled={!path.trim()}>
              Add
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  )
}
