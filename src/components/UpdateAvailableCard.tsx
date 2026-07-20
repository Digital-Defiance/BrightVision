import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { Alert, Button, Typography } from '@mui/material'
import type { GithubReleaseInfo } from '../utils/appUpdateCheck'

interface UpdateAvailableCardProps {
  currentVersion: string
  release: GithubReleaseInfo
  onDismiss: () => void
}

export function UpdateAvailableCard({
  currentVersion,
  release,
  onDismiss,
}: UpdateAvailableCardProps) {
  return (
    <Alert
      severity="info"
      variant="outlined"
      sx={{ mb: 2 }}
      data-testid="app-update-banner"
      onClose={onDismiss}
      action={
        <Button
          color="inherit"
          size="small"
          component="a"
          href={release.url}
          target="_blank"
          rel="noopener noreferrer"
          endIcon={<OpenInNewIcon fontSize="inherit" />}
          data-testid="app-update-view-release"
        >
          View release
        </Button>
      }
    >
      <Typography variant="body2" component="span">
        Update available — <strong>{release.version}</strong> is on GitHub (you have{' '}
        <strong>{currentVersion}</strong>).
      </Typography>
    </Alert>
  )
}
