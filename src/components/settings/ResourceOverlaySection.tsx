import { FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, Typography } from '@mui/material'
import {
  DEFAULT_RESOURCE_OVERLAY_PREFS,
  type ResourceOverlayPrefs,
} from '../../theme/resourceOverlayPrefs'
import { isTauriRuntime } from '../../ipc/isTauri'

interface ResourceOverlaySectionProps {
  prefs: ResourceOverlayPrefs
  onChange: (next: ResourceOverlayPrefs) => void
}

export function ResourceOverlaySection({ prefs, onChange }: ResourceOverlaySectionProps) {
  if (!isTauriRuntime()) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          Resource overlay
        </Typography>
        <Typography variant="body2" color="text.secondary">
          CPU/RAM HUD is available in the desktop app only (Tauri). Web dev mode cannot read
          system metrics.
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        Resource overlay
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Compact CPU, RAM, and GPU readout in the bottom of the left nav column (does not
        cover chat or images)
        (NVIDIA via <code>nvidia-smi</code> when available).
      </Typography>
      <Stack spacing={1}>
        <FormControlLabel
          control={
            <Switch
              checked={prefs.showOverlay}
              onChange={(_, v) => onChange({ ...prefs, showOverlay: v })}
            />
          }
          label="Show overlay"
        />
        <TextField
          select
          size="small"
          label="Refresh interval"
          value={String(prefs.pollIntervalSec)}
          onChange={(e) =>
            onChange({ ...prefs, pollIntervalSec: Number(e.target.value) })
          }
          sx={{ maxWidth: 200 }}
        >
          {[1, 2, 3, 5, 10].map((n) => (
            <MenuItem key={n} value={String(n)}>
              {n} s
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={
            <Switch
              checked={prefs.showGpu}
              onChange={(_, v) => onChange({ ...prefs, showGpu: v })}
            />
          }
          label="Show GPU % (NVIDIA: nvidia-smi; Apple Silicon: IOKit)"
        />
        <TextField
          select
          size="small"
          label="CPU warning threshold"
          value={String(prefs.warnCpuPct)}
          onChange={(e) =>
            onChange({ ...prefs, warnCpuPct: Number(e.target.value) })
          }
          sx={{ maxWidth: 200 }}
        >
          {[70, 80, 85, 90, 95].map((n) => (
            <MenuItem key={n} value={String(n)}>
              {n}%
            </MenuItem>
          ))}
        </TextField>
        <Typography
          component="button"
          type="button"
          variant="caption"
          color="primary"
          onClick={() => onChange({ ...DEFAULT_RESOURCE_OVERLAY_PREFS })}
          sx={{ border: 0, bgcolor: 'transparent', cursor: 'pointer', textAlign: 'left', p: 0 }}
        >
          Reset overlay defaults
        </Typography>
      </Stack>
    </Paper>
  )
}
