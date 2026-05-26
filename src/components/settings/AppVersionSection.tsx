import { Paper, Stack, Typography } from '@mui/material'
import type { AppVersions } from '../../hooks/useAppVersions'

function VersionRow({ label, value }: { label: string; value: string | null }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="baseline">
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        component="code"
        sx={{ fontFamily: 'monospace', textAlign: 'right', wordBreak: 'break-all' }}
      >
        {value ?? '—'}
      </Typography>
    </Stack>
  )
}

interface AppVersionSectionProps {
  versions: AppVersions
}

export function AppVersionSection({ versions }: AppVersionSectionProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="settings-versions">
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        About
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {versions.loading
          ? 'Loading versions…'
          : 'App version is the installed BrightVision build. Engine versions come from the running core API.'}
      </Typography>
      <Stack spacing={1}>
        <VersionRow label="BrightVision app" value={versions.app} />
        <VersionRow label="bright-vision-core" value={versions.brightVisionCore} />
        <VersionRow label="cecli" value={versions.cecli} />
      </Stack>
      {!versions.loading && !versions.brightVisionCore && !versions.cecli && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          Engine versions load from the running core API or your configured Python engine path.
          Start Vision on the Terminal tab, or check Core engine path / Python in Settings below.
        </Typography>
      )}
    </Paper>
  )
}
