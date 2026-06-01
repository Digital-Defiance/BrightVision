import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import RefreshIcon from '@mui/icons-material/Refresh'
import SendIcon from '@mui/icons-material/Send'
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import QRCode from 'react-qr-code'
import { isTauriRuntime } from '../../ipc/isTauri'
import { sendNtfyTestPing } from '../../ipc/ntfyAlerts'
import {
  DEFAULT_NTFY_ALERTS_PREFS,
  generateNtfyTopic,
  ntfyAppSubscribeUrl,
  ntfySubscribeUrl,
  type NtfyAlertsPrefs,
} from '../../theme/ntfyAlertsPrefs'

interface NtfyAlertsSectionProps {
  prefs: NtfyAlertsPrefs
  onChange: (next: NtfyAlertsPrefs) => void
  onMessage?: (message: string, severity: 'info' | 'warning') => void
}

export function NtfyAlertsSection({ prefs, onChange, onMessage }: NtfyAlertsSectionProps) {
  const [testing, setTesting] = useState(false)

  if (!isTauriRuntime()) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }} data-testid="settings-ntfy-alerts">
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          Mobile alerts (ntfy)
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Phone and Wear OS notifications are available in the desktop app (Tauri). Install the
          open-source ntfy app on Android and subscribe to your private topic.
        </Typography>
      </Paper>
    )
  }

  const subscribeUrl = ntfySubscribeUrl(prefs)
  const appUrl = ntfyAppSubscribeUrl(prefs)

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      onMessage?.(`Copied ${label}`, 'info')
    } catch {
      onMessage?.('Copy failed', 'warning')
    }
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      await sendNtfyTestPing(prefs)
      onMessage?.('Test notification sent — check your phone', 'info')
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : String(err), 'warning')
    } finally {
      setTesting(false)
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="settings-ntfy-alerts">
      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        Mobile alerts (ntfy)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        When a long chat turn or spec generate/refine job finishes, BrightVision can POST to{' '}
        <a href="https://ntfy.sh" target="_blank" rel="noopener noreferrer">
          ntfy
        </a>
        . Android shows the notification; Wear OS mirrors it automatically. Messages are{' '}
        <strong>metadata only</strong> (duration, queue count) — never prompt text or file paths.
      </Typography>

      <Stack spacing={1.5}>
        <FormControlLabel
          control={
            <Switch
              checked={prefs.enabled}
              onChange={(_, enabled) => onChange({ ...prefs, enabled })}
              data-testid="settings-ntfy-enabled"
            />
          }
          label="Notify when work completes"
        />

        <TextField
          label="ntfy server"
          size="small"
          fullWidth
          value={prefs.serverBase}
          onChange={(e) =>
            onChange({ ...prefs, serverBase: e.target.value.trim().replace(/\/+$/, '') })
          }
          helperText="Default https://ntfy.sh — or your self-hosted ntfy base URL"
          disabled={!prefs.enabled}
        />

        <TextField
          label="Private topic"
          size="small"
          fullWidth
          value={prefs.topic}
          onChange={(e) => onChange({ ...prefs, topic: e.target.value.trim() })}
          helperText="Treat like a password — anyone with the topic can read alerts"
          disabled={!prefs.enabled}
          InputProps={{
            endAdornment: (
              <Tooltip title="Regenerate topic (re-subscribe on phone)">
                <IconButton
                  size="small"
                  aria-label="Regenerate ntfy topic"
                  disabled={!prefs.enabled}
                  onClick={() => onChange({ ...prefs, topic: generateNtfyTopic() })}
                >
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ),
          }}
        />

        <TextField
          label="Minimum turn duration (seconds)"
          size="small"
          type="number"
          inputProps={{ min: 0, step: 30 }}
          value={prefs.minDurationSec}
          onChange={(e) =>
            onChange({
              ...prefs,
              minDurationSec: Math.max(0, Number(e.target.value) || 0),
            })
          }
          helperText="0 = notify on every completed turn or spec job that passes other filters"
          disabled={!prefs.enabled}
        />

        <FormControlLabel
          control={
            <Switch
              checked={prefs.notifyWhenBackgroundOnly}
              onChange={(_, notifyWhenBackgroundOnly) =>
                onChange({ ...prefs, notifyWhenBackgroundOnly })
              }
              disabled={!prefs.enabled}
            />
          }
          label="Only when BrightVision is in the background"
        />

        {prefs.enabled && prefs.topic.trim() && (
          <Alert severity="info" sx={{ alignItems: 'flex-start' }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              alignItems={{ xs: 'center', sm: 'flex-start' }}
            >
              <Box
                sx={{
                  p: 1,
                  bgcolor: '#fff',
                  borderRadius: 1,
                  border: 1,
                  borderColor: 'divider',
                  flexShrink: 0,
                }}
                data-testid="settings-ntfy-qr"
              >
                <QRCode value={appUrl} size={148} aria-label="ntfy subscribe QR code" />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" gutterBottom>
                  <strong>Phone setup (once):</strong> Install ntfy from Play Store or F-Droid, then
                  scan this QR code — or copy the subscribe link below.
                </Typography>
                <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography
                    component="code"
                    variant="caption"
                    sx={{ wordBreak: 'break-all', flex: 1, minWidth: 200 }}
                  >
                    {subscribeUrl}
                  </Typography>
                  <Tooltip title="Copy subscribe URL">
                    <IconButton
                      size="small"
                      aria-label="Copy subscribe URL"
                      onClick={() => void copy(subscribeUrl, 'subscribe URL')}
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
                <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                  QR encodes <code>{appUrl}</code> — opens the ntfy app and subscribes automatically.
                </Typography>
              </Box>
            </Stack>
          </Alert>
        )}

        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<SendIcon />}
            disabled={!prefs.enabled || !prefs.topic.trim() || testing}
            onClick={() => void handleTest()}
            data-testid="settings-ntfy-test"
          >
            Send test notification
          </Button>
          <Button
            size="small"
            variant="text"
            onClick={() => onChange({ ...DEFAULT_NTFY_ALERTS_PREFS, topic: prefs.topic })}
          >
            Reset ntfy defaults
          </Button>
        </Stack>
      </Stack>
    </Paper>
  )
}
