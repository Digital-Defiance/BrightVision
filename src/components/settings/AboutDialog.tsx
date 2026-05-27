import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material'
import { DISPLAY_VISION } from '../../brand'
import type { AppVersions } from '../../hooks/useAppVersions'
import { AppVersionSection } from './AppVersionSection'

interface AboutDialogProps {
  open: boolean
  onClose: () => void
  versions: AppVersions
}

export function AboutDialog({ open, onClose, versions }: AboutDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="about-dialog-title"
      data-testid="about-dialog"
    >
      <DialogTitle id="about-dialog-title">{DISPLAY_VISION}</DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        <AppVersionSection versions={versions} embedded />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
