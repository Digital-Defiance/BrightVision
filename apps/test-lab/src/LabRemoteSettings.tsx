import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import RefreshIcon from '@mui/icons-material/Refresh'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'react-qr-code'
import {
  buildLabLanPairingPayload,
  encodeLabLanPairingQr,
  labLanUrlForAddress,
} from '@brightvision/test-suite-client'
import {
  DEFAULT_TEST_LAB_LAB_REMOTE_PREFS,
  loadTestLabLabRemotePrefs,
  saveTestLabLabRemotePrefs,
  type TestLabLabRemotePrefs,
} from './labRemotePrefs'

interface LabRemoteSettingsProps {
  activeRunId?: string | null
  onMessage?: (message: string, severity: 'info' | 'warning') => void
}

type LanStatus = {
  running: boolean
  proxyPort: number
  orchPort: number
  addresses: string[]
}

export function LabRemoteSettings({ activeRunId, onMessage }: LabRemoteSettingsProps) {
  const [prefs, setPrefs] = useState<TestLabLabRemotePrefs>(() => loadTestLabLabRemotePrefs())
  const [token, setToken] = useState('')
  const [deviceName, setDeviceName] = useState('Test Lab')
  const [status, setStatus] = useState<LanStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refreshStatus = useCallback(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const s = await invoke<LanStatus>('lab_lan_remote_proxy_status')
      setStatus(s)
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const [t, name] = await Promise.all([
          invoke<string>('get_lab_remote_token'),
          invoke<string>('lab_device_name'),
        ])
        setToken(t)
        setDeviceName(name)
      } catch {
        /* web dev without Tauri */
      }
      await refreshStatus()
    })()
  }, [refreshStatus])

  const persist = (next: TestLabLabRemotePrefs) => {
    setPrefs(next)
    saveTestLabLabRemotePrefs(next)
  }

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      onMessage?.(`Copied ${label}`, 'info')
    } catch {
      onMessage?.('Copy failed', 'warning')
    }
  }

  const pairingUrl = useMemo(() => {
    const addr = status?.addresses[0]
    if (!addr || !token) return null
    const port = status?.proxyPort ?? prefs.proxyPort
    return labLanUrlForAddress(addr, port)
  }, [status, token, prefs.proxyPort])

  const qrPayload = useMemo(() => {
    if (!pairingUrl || !token) return null
    return encodeLabLanPairingQr(
      buildLabLanPairingPayload({
        lanUrl: pairingUrl,
        token,
        deviceName,
        activeRunId: activeRunId ?? undefined,
      })
    )
  }, [pairingUrl, token, deviceName, activeRunId])

  const toggleEnabled = async (enabled: boolean) => {
    setBusy(true)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      if (enabled) {
        await invoke('start_lab_lan_remote_proxy', {
          token,
          proxyPort: prefs.proxyPort,
        })
        onMessage?.('Lab Remote LAN proxy started', 'info')
      } else {
        await invoke('stop_lab_lan_remote_proxy')
        onMessage?.('Lab Remote LAN proxy stopped', 'info')
      }
      persist({ ...prefs, enabled })
      await refreshStatus()
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : String(err), 'warning')
      persist({ ...prefs, enabled: false })
    } finally {
      setBusy(false)
    }
  }

  const rotateToken = async () => {
    setBusy(true)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const t = await invoke<string>('generate_lab_remote_token')
      setToken(t)
      if (prefs.enabled) {
        await invoke('start_lab_lan_remote_proxy', { token: t, proxyPort: prefs.proxyPort })
        await refreshStatus()
      }
      onMessage?.('New Lab Remote token — re-scan QR on your phone', 'info')
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : String(err), 'warning')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Accordion disableGutters sx={{ mb: 2, '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2">Lab Remote (phone progress)</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Same Wi‑Fi: scan the QR with <strong>BrightVision Lab Remote</strong> (Expo) to watch
          suite step and sub-step progress. No log streaming — status only.
        </Typography>

        {!status ? (
          <Alert severity="info" sx={{ mb: 1 }}>
            Lab Remote proxy requires the Test Lab desktop app (Tauri).
          </Alert>
        ) : null}

        <Stack spacing={1.5}>
          <FormControlLabel
            control={
              <Switch
                checked={prefs.enabled}
                disabled={busy || !status}
                onChange={(_, on) => void toggleEnabled(on)}
              />
            }
            label="Enable LAN proxy"
          />

          {status?.running && pairingUrl ? (
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                Scan with Lab Remote app
              </Typography>
              <Box
                sx={{
                  bgcolor: '#fff',
                  p: 1.5,
                  borderRadius: 1,
                  display: 'inline-block',
                  maxWidth: '100%',
                }}
              >
                {qrPayload ? <QRCode value={qrPayload} size={160} /> : null}
              </Box>
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {pairingUrl}
                </Typography>
                <Tooltip title="Copy URL">
                  <IconButton size="small" onClick={() => void copy(pairingUrl, 'URL')}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
              {activeRunId ? (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  QR includes active run id for mid-run pairing.
                </Typography>
              ) : null}
            </Box>
          ) : prefs.enabled ? (
            <Alert severity="warning">Proxy enabled but no LAN address found. Check Wi‑Fi.</Alert>
          ) : null}

          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshIcon />}
              disabled={busy}
              onClick={() => void rotateToken()}
            >
              New token
            </Button>
            <Button size="small" variant="text" disabled={busy} onClick={() => void refreshStatus()}>
              Refresh status
            </Button>
          </Stack>

          {status ? (
            <Typography variant="caption" color="text.secondary">
              Proxy :{status.proxyPort} → orchestrator :{status.orchPort}
              {status.addresses.length ? ` · ${status.addresses.join(', ')}` : ''}
            </Typography>
          ) : null}
        </Stack>
      </AccordionDetails>
    </Accordion>
  )
}
