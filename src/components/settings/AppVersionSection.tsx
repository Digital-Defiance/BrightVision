import Link from '@mui/material/Link'
import { Box, Paper, Stack, Typography } from '@mui/material'
import {
  CECLI_GITHUB_URL,
  CECLI_HOME_URL,
  DISPLAY_CORE,
  DISPLAY_VISION,
  DISPLAY_VISION_API,
} from '../../brand'
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
  /** When true, omit outer Paper (e.g. inside About dialog). */
  embedded?: boolean
}

export function AppVersionSection({ versions, embedded = false }: AppVersionSectionProps) {
  const body = (
    <>
      {!embedded && (
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          About
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {versions.loading
          ? 'Loading versions…'
          : `App version is the installed ${DISPLAY_VISION} build. Engine versions come from the running ${DISPLAY_VISION_API}.`}
      </Typography>
      <Stack spacing={1}>
        <VersionRow label="BrightVision app" value={versions.app} />
        <VersionRow label={`${DISPLAY_VISION_API} (package)`} value={versions.brightVisionCore} />
        <VersionRow label={DISPLAY_CORE} value={versions.cecli} />
      </Stack>
      {!versions.loading && !versions.brightVisionCore && !versions.cecli && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          Engine versions load from the running {DISPLAY_VISION_API} or your configured Python engine path.
          Start a session on the Terminal tab, or check engine folder / Python in Settings below.
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        {DISPLAY_VISION} is built in partnership with the{' '}
        <Link href={CECLI_HOME_URL} target="_blank" rel="noopener noreferrer">
          {DISPLAY_CORE}
        </Link>{' '}
        team (
        <Link href={CECLI_GITHUB_URL} target="_blank" rel="noopener noreferrer">
          dwash96/cecli
        </Link>
        ). Every coding turn runs on {DISPLAY_CORE}; {DISPLAY_VISION} adds the desktop shell and{' '}
        {DISPLAY_VISION_API}.
      </Typography>
    </>
  )

  if (embedded) {
    return (
      <Box data-testid="settings-versions" sx={{ pt: 0.5 }}>
        {body}
      </Box>
    )
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="settings-versions">
      {body}
    </Paper>
  )
}
