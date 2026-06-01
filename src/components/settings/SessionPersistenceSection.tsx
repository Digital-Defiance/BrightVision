import SaveAltIcon from '@mui/icons-material/SaveAlt'
import {
  Alert,
  Button,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import type { VisionConfig } from '../../ipc/config'
import { isTauriRuntime } from '../../ipc/isTauri'
import { WORKSPACE_META_DIR } from '../../brand'

interface SessionPersistenceSectionProps {
  config: VisionConfig
  onChange: (next: VisionConfig) => void
  /** Active Vision session id (required to download debug bundle). */
  sessionId?: string | null
  onExportSessionDebug?: () => void | Promise<void>
}

export function SessionPersistenceSection({
  config,
  onChange,
  sessionId,
  onExportSessionDebug,
}: SessionPersistenceSectionProps) {
  const desktop = isTauriRuntime()
  const patch = (partial: Partial<VisionConfig>) => onChange({ ...config, ...partial })

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="settings-session-persistence">
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Session history (Cecli)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Uses Cecli builtins under <code>{WORKSPACE_META_DIR}/sessions/</code> and optional{' '}
        <code>{WORKSPACE_META_DIR}/chat.history</code>. May contain secrets and code from your
        project — add to <code>.gitignore</code> if needed.
      </Typography>

      {!desktop && config.sessionEncrypt && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          Encrypted sessions require the desktop app (OS keychain). In the browser, turn off
          encryption or set <code>CECLI_SESSION_KEY</code> yourself for the Vision API process.
        </Alert>
      )}

      <Stack spacing={0.5}>
        <FormControlLabel
          control={
            <Switch
              checked={config.chatHistoryFile}
              onChange={(_, v) => patch({ chatHistoryFile: v })}
              data-testid="settings-chat-history-file"
            />
          }
          label="Append chat to .cecli/chat.history"
        />
        <FormControlLabel
          control={
            <Switch
              checked={config.autoSaveSession}
              onChange={(_, v) => patch({ autoSaveSession: v })}
              data-testid="settings-auto-save-session"
            />
          }
          label="Auto-save session (Cecli --auto-save)"
        />
        <FormControlLabel
          control={
            <Switch
              checked={config.autoLoadSession}
              onChange={(_, v) => patch({ autoLoadSession: v })}
              disabled={!config.autoSaveSession}
              data-testid="settings-auto-load-session"
            />
          }
          label="Restore auto-save on session start (--auto-load)"
        />
        <TextField
          size="small"
          label="Auto-save session name"
          value={config.autoSaveSessionName}
          onChange={(e) => patch({ autoSaveSessionName: e.target.value.trim() || 'brightvision' })}
          disabled={!config.autoSaveSession}
          helperText="File: .cecli/sessions/<name>.json"
          sx={{ maxWidth: 360, mt: 0.5 }}
          inputProps={{ 'data-testid': 'settings-auto-save-session-name' }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={config.sessionEncrypt}
              onChange={(_, v) => patch({ sessionEncrypt: v })}
              data-testid="settings-session-encrypt"
            />
          }
          label="Encrypt saved sessions (AES-256-GCM)"
        />
        {config.sessionEncrypt && desktop && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ pl: 4 }}>
            Key is stored in the OS keychain and passed to the Vision API as CECLI_SESSION_KEY. You
            can also use /save-session and /load-session in chat.
          </Typography>
        )}
      </Stack>

      {onExportSessionDebug && (
        <Stack spacing={0.5} sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle2" fontWeight={600}>
            Session debug
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Download a JSON bundle (messages, tool calls, recent events) when reporting tool-call or
            streaming issues. Redact secrets before sharing.
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<SaveAltIcon />}
            data-testid="settings-export-session-debug"
            onClick={() => void onExportSessionDebug()}
            disabled={!sessionId}
            sx={{ alignSelf: 'flex-start', mt: 0.5 }}
          >
            Export debug bundle
          </Button>
        </Stack>
      )}
    </Paper>
  )
}
