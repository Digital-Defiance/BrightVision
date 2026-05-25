import { Alert, AlertTitle, Button, Stack, Typography } from '@mui/material'
import type { CoreConfirmEvent } from '../ipc/events'

interface ConfirmBannerProps {
  confirm: CoreConfirmEvent
  onAnswer: (accepted: boolean) => void
}

export function ConfirmBanner({ confirm, onAnswer }: ConfirmBannerProps) {
  return (
    <Alert severity="warning" sx={{ mb: 2 }} data-testid="confirm-banner">
      <AlertTitle>Confirmation required</AlertTitle>
      <Typography variant="body2">{confirm.question}</Typography>
      {confirm.subject && (
        <Typography variant="caption" display="block" sx={{ mt: 0.5, fontFamily: 'monospace' }}>
          {confirm.subject}
        </Typography>
      )}
      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
        <Button size="small" variant="contained" onClick={() => onAnswer(true)}>
          Yes
        </Button>
        <Button size="small" variant="outlined" onClick={() => onAnswer(false)}>
          No
        </Button>
      </Stack>
    </Alert>
  )
}
