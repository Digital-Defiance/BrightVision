import CloseIcon from '@mui/icons-material/Close'
import { Alert, AlertTitle, IconButton, Typography } from '@mui/material'
import type { CoreConfirmEvent } from '../ipc/events'

interface ConfirmBannerProps {
  confirm: CoreConfirmEvent
  onDismiss: () => void
}

export function ConfirmBanner({ confirm, onDismiss }: ConfirmBannerProps) {
  return (
    <Alert
      severity="warning"
      sx={{ mb: 2 }}
      action={
        <IconButton color="inherit" size="small" onClick={onDismiss} aria-label="Dismiss">
          <CloseIcon fontSize="small" />
        </IconButton>
      }
    >
      <AlertTitle>Confirmation required</AlertTitle>
      <Typography variant="body2">{confirm.question}</Typography>
      {confirm.subject && (
        <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
          Subject: {confirm.subject}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
        Approvals are handled inside the engine; enable auto-approve in settings for unattended runs.
      </Typography>
    </Alert>
  )
}
