import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import RefreshIcon from '@mui/icons-material/Refresh'
import SendIcon from '@mui/icons-material/Send'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useState } from 'react'
import QRCode from 'react-qr-code'
import {
  DEFAULT_TEST_LAB_NTFY_PREFS,
  generateNtfyTopic,
  ntfyAppSubscribeUrl,
  ntfySubscribeUrl,
  type TestLabNtfyPrefs,
} from './ntfyLabPrefs'
import { sendTestLabNtfyTestPing } from './ntfyLab'

interface NtfyLabSettingsProps {
  prefs: TestLabNtfyPrefs
  onChange: (next: TestLabNtfyPrefs) => void
  onMessage?: (message: string, severity: 'info' | 'warning') => void
}

export function NtfyLabSettings({ prefs, onChange, onMessage }: NtfyLabSettingsProps) {
  const [testing, setTesting] = useState(false)
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
      await sendTestLabNtfyTestPing(prefs)
      onMessage?.('Test notification sent — check your phone', 'info')
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : String(err), 'warning')
    } finally {
      setTesting(false)
    }
  }

  return (
    <Accordion disableGutters sx={{ mb: 2, '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2">Mobile alerts (ntfy)</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          When a full suite run finishes, Test Lab can POST to{' '}
          <a href="https://ntfy.sh" target="_blank" rel="noopener noreferrer">
            ntfy
          </a>
          . Scan the QR code with the ntfy Android app to subscribe. Messages include pass/fail
          and timing only — not log excerpts.
        </Typography>

        <Stack spacing={1.5}>
          <FormControlLabel
            control={
              <Switch
                checked={prefs.enabled}
                onChange={(_, enabled) => onChange({ ...prefs, enabled })}
              />
            }
            label="Notify when a full suite run completes"
          />

          <TextField
            label="Server URL"
            size="small"
            fullWidth
            value={prefs.serverBase}
            onChange={(e) => onChange({ ...prefs, serverBase: e.target.value })}
            placeholder={DEFAULT_TEST_LAB_NTFY_PREFS.serverBase}
          />

          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              label="Topic"
              size="small"
              fullWidth
              value={prefs.topic}
              onChange={(e) => onChange({ ...prefs, topic: e.target.value })}
              helperText="Private topic — do not share publicly"
            />
            <Tooltip title="New random topic">
              <IconButton
                aria-label="Regenerate topic"
                onClick={() => onChange({ ...prefs, topic: generateNtfyTopic() })}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Stack>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button
              variant="outlined"
              size="small"
              startIcon={<SendIcon />}
              disabled={testing || !prefs.topic.trim()}
              onClick={() => void handleTest()}
            >
              {testing ? 'Sending…' : 'Test ping'}
            </Button>
            <Button
              variant="text"
              size="small"
              startIcon={<ContentCopyIcon />}
              onClick={() => void copy(subscribeUrl, 'subscribe URL')}
            >
              Copy URL
            </Button>
            <Button
              variant="text"
              size="small"
              startIcon={<ContentCopyIcon />}
              onClick={() => void copy(appUrl, 'app link')}
            >
              Copy app link
            </Button>
          </Stack>

          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 2,
              alignItems: 'flex-start',
            }}
          >
            <Box
              sx={{
                bgcolor: '#fff',
                p: 1.5,
                borderRadius: 1,
                border: 1,
                borderColor: 'divider',
              }}
            >
              <QRCode value={appUrl} size={140} level="M" />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                Open ntfy on Android → Add subscription → Scan QR (or paste topic). Self-hosted
                servers: set the server URL above first, then regenerate QR.
              </Typography>
              <Typography
                variant="caption"
                component="code"
                sx={{ wordBreak: 'break-all', display: 'block', mt: 1 }}
              >
                {prefs.topic}
              </Typography>
            </Box>
          </Box>
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}
