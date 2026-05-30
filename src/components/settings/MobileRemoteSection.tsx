import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import RefreshIcon from '@mui/icons-material/Refresh'
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
import { useCallback, useEffect, useMemo, useState } from 'react'
import QRCode from 'react-qr-code'
import type { VisionConfig } from '../../ipc/config'
import { isTauriRuntime } from '../../ipc/isTauri'
import {
  buildLanPairingQrPayload,
  generateVisionApiToken,
  getLanHostAddresses,
  lanPairingQrString,
  lanRemoteProxyStatus,
  startLanRemoteProxy,
  stopLanRemoteProxy,
  type LanRemoteStatus,
} from '../../ipc/lanRemote'

interface MobileRemoteSectionProps {
  config: VisionConfig
  onChange: (next: VisionConfig) => void
  visionApiRunning: boolean
  onMessage?: (message: string, severity: 'info' | 'warning' | 'error') => void
}

export function MobileRemoteSection({
  config,
  onChange,
  visionApiRunning,
  onMessage,
}: MobileRemoteSectionProps) {
  const [status, setStatus] = useState<LanRemoteStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refreshStatus = useCallback(async () => {
    if (!isTauriRuntime()) return
    try {
      setStatus(await lanRemoteProxyStatus())
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  const addresses = status?.addresses ?? []
  const proxyPort = config.lanProxyPort
  const qrPayload = useMemo(
    () =>
      buildLanPairingQrPayload({
        addresses,
        proxyPort,
        token: config.coreApiToken,
        deviceName: 'BrightVision',
      }),
    [addresses, proxyPort, config.coreApiToken]
  )
  const qrValue = qrPayload ? lanPairingQrString(qrPayload) : ''

  const applyLan = useCallback(
    async (enabled: boolean) => {
      if (!isTauriRuntime()) return
      setBusy(true)
      try {
        let token = config.coreApiToken.trim()
        if (enabled && !token) {
          token = await generateVisionApiToken()
          onChange({ ...config, coreApiToken: token })
        }
        if (enabled) {
          if (!visionApiRunning) {
            onMessage?.(
              'Start the Vision API first (Terminal → Start or Settings), then enable LAN Link.',
              'warning'
            )
            onChange({ ...config, lanRemoteEnabled: false })
            return
          }
          if (!token) {
            onMessage?.('Vision API token is required for LAN remote.', 'error')
            return
          }
          const next = await startLanRemoteProxy({
            token,
            proxyPort: config.lanProxyPort,
            deviceName: 'BrightVision',
          })
          setStatus(next)
          onChange({ ...config, lanRemoteEnabled: true, coreApiToken: token })
          onMessage?.('LAN Link is on — scan the QR from BrightVision Remote.', 'info')
        } else {
          await stopLanRemoteProxy()
          await refreshStatus()
          onChange({ ...config, lanRemoteEnabled: false })
        }
      } catch (e) {
        onMessage?.(e instanceof Error ? e.message : String(e), 'error')
        onChange({ ...config, lanRemoteEnabled: false })
      } finally {
        setBusy(false)
      }
    },
    [config, onChange, onMessage, refreshStatus, visionApiRunning]
  )

  const regenerateToken = useCallback(async () => {
    if (!isTauriRuntime()) return
    setBusy(true)
    try {
      const token = await generateVisionApiToken()
      onChange({ ...config, coreApiToken: token })
      if (config.lanRemoteEnabled && visionApiRunning) {
        await stopLanRemoteProxy()
        onMessage?.(
          'Token rotated — Stop and Start the Vision API, then turn LAN Link on again.',
          'warning'
        )
        onChange({ ...config, coreApiToken: token, lanRemoteEnabled: false })
      }
    } catch (e) {
      onMessage?.(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }, [config, onChange, onMessage, visionApiRunning])

  if (!isTauriRuntime()) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }} data-testid="settings-mobile-remote">
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          BrightVision Remote (LAN)
        </Typography>
        <Typography variant="body2" color="text.secondary">
          LAN pairing and QR codes are available in the desktop app. Use{' '}
          <code>apps/remote</code> with a manual API URL for browser-only dev.
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="settings-mobile-remote">
      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        BrightVision Remote (LAN Link)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Same Wi‑Fi: phones connect to a local proxy on this Mac (port {proxyPort}) with a Bearer
        token. Vision API stays on loopback; nothing is exposed without a token except{' '}
        <code>/health</code>.
      </Typography>
      <FormControlLabel
        control={
          <Switch
            checked={config.lanRemoteEnabled}
            disabled={busy}
            onChange={(_, checked) => void applyLan(checked)}
            data-testid="lan-remote-toggle"
          />
        }
        label="Enable LAN Link"
      />
      <Stack spacing={1.5} sx={{ mt: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            label="Vision API token"
            fullWidth
            size="small"
            type="password"
            value={config.coreApiToken}
            onChange={(e) => onChange({ ...config, coreApiToken: e.target.value })}
            helperText="Required for LAN. Passed to core as BRIGHT_VISION_TOKEN when you Start the API."
          />
          <Button size="small" disabled={busy} onClick={() => void regenerateToken()}>
            New token
          </Button>
        </Stack>
        <TextField
          label="LAN proxy port"
          size="small"
          type="number"
          value={config.lanProxyPort}
          disabled={config.lanRemoteEnabled || busy}
          onChange={(e) =>
            onChange({
              ...config,
              lanProxyPort: parseInt(e.target.value, 10) || proxyPort,
            })
          }
          sx={{ maxWidth: 160 }}
        />
        {config.lanRemoteEnabled && (
          <>
            {addresses.length === 0 ? (
              <Alert severity="warning">No LAN IPv4 address found. Check Wi‑Fi.</Alert>
            ) : (
              <Typography variant="body2" color="text.secondary">
                LAN URLs:{' '}
                {addresses.map((ip) => (
                  <code key={ip} style={{ marginRight: 8 }}>
                    http://{ip}:{proxyPort}
                  </code>
                ))}
              </Typography>
            )}
            {qrValue ? (
              <Box
                sx={{
                  p: 2,
                  bgcolor: 'background.paper',
                  borderRadius: 1,
                  display: 'inline-block',
                  alignSelf: 'flex-start',
                }}
                data-testid="lan-remote-qr"
              >
                <QRCode value={qrValue} size={160} />
              </Box>
            ) : null}
            <Stack direction="row" spacing={1} alignItems="center">
              <Tooltip title="Copy pairing JSON">
                <span>
                  <IconButton
                    size="small"
                    disabled={!qrValue}
                    onClick={() => {
                      void navigator.clipboard.writeText(qrValue)
                      onMessage?.('Pairing payload copied.', 'info')
                    }}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Button size="small" startIcon={<RefreshIcon />} onClick={() => void refreshStatus()}>
                Refresh addresses
              </Button>
              <Button
                size="small"
                onClick={async () => {
                  const ips = await getLanHostAddresses()
                  setStatus((s) =>
                    s ? { ...s, addresses: ips } : { running: true, proxyPort, corePort: 8741, addresses: ips }
                  )
                }}
              >
                Rescan network
              </Button>
            </Stack>
          </>
        )}
      </Stack>
    </Paper>
  )
}
