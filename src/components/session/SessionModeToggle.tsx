import ChatIcon from '@mui/icons-material/Chat'
import ArticleIcon from '@mui/icons-material/Article'
import { Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import { sessionModeSync, sessionModeSyncHint, type SessionMode } from '../../utils/sessionModeSync'

export type { SessionMode }

export interface SessionModeToggleProps {
  value: SessionMode
  onChange: (mode: SessionMode) => void
  /** Mode the running session was started with; null when stopped. */
  liveMode?: SessionMode | null
  sessionRunning?: boolean
  size?: 'small' | 'medium'
  disabled?: boolean
}

export function SessionModeToggle({
  value,
  onChange,
  liveMode = null,
  sessionRunning = false,
  size = 'small',
  disabled,
}: SessionModeToggleProps) {
  const sync = sessionModeSync({
    sessionRunning,
    liveMode,
    selectedMode: value,
  })
  const hint = sessionModeSyncHint(sync, liveMode, value)

  return (
    <Stack direction="row" alignItems="center" spacing={0.5} data-testid="session-mode-toggle">
      <ToggleButtonGroup
        exclusive
        size={size}
        value={value}
        disabled={disabled}
        onChange={(_e, next) => {
          if (next) onChange(next as SessionMode)
        }}
        aria-label="Session mode"
        sx={{
          ...(sync === 'live' && {
            '& .MuiToggleButton-root.Mui-selected': {
              boxShadow: (theme) => `0 0 0 2px ${theme.palette.success.main}`,
            },
          }),
          ...(sync === 'pending' && {
            '& .MuiToggleButton-root.Mui-selected': {
              borderColor: 'warning.main',
              borderStyle: 'dashed',
              borderWidth: 2,
            },
          }),
        }}
      >
        <ToggleButton
          value="vibe"
          data-testid="session-mode-vibe"
          title="Implementation chat — default coding session"
        >
          <ChatIcon fontSize="small" sx={{ mr: 0.5 }} />
          Vibe
        </ToggleButton>
        <ToggleButton
          value="spec"
          data-testid="session-mode-spec"
          title="Spec-first — Spec tab, steering, active task spec on turns"
        >
          <ArticleIcon fontSize="small" sx={{ mr: 0.5 }} />
          Spec
        </ToggleButton>
      </ToggleButtonGroup>
      <Tooltip title={hint}>
        <Typography
          component="span"
          variant="caption"
          data-testid="session-mode-sync-status"
          aria-label={hint}
          sx={{
            color: sync === 'pending' ? 'warning.main' : sync === 'live' ? 'success.main' : 'text.disabled',
            fontWeight: 700,
            lineHeight: 1,
            minWidth: 10,
            textAlign: 'center',
          }}
        >
          {sync === 'pending' ? '*' : sync === 'live' ? '●' : '○'}
        </Typography>
      </Tooltip>
    </Stack>
  )
}
