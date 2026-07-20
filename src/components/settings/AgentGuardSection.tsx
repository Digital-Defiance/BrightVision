import {
  Alert,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import type { AgentGuardPrefs, AgentTimeUnit } from '../../theme/agentGuardPrefs'
import { agentTimeUnitOptions, normalizeAgentTimeUnit } from '../../utils/agentGuard'
import { bdFromUnixMs, formatBdScalar } from '@brightvision/vision-client'

interface AgentGuardSectionProps {
  prefs: AgentGuardPrefs
  brightDateMode: boolean
  onChange: (prefs: AgentGuardPrefs) => void
}

export function AgentGuardSection({ prefs, brightDateMode, onChange }: AgentGuardSectionProps) {
  const units = agentTimeUnitOptions(brightDateMode)
  const unit = normalizeAgentTimeUnit(prefs.maxAgentTimeUnit, brightDateMode)
  const nowBd = formatBdScalar(bdFromUnixMs(Date.now()), 5)

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2 }} data-testid="settings-agent-guard">
      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        Agent limits &amp; pause
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Optional caps for <code>/agent</code> runs in this session. Leave fields empty for no
        limit. Chat: <code>/pause</code> (finish current step, then hold),{' '}
        <code>/resume</code>. Command allowlists need cecli support (longer-term).
      </Typography>

      <Stack spacing={2}>
        <TextField
          label="Maximum agent turns"
          size="small"
          fullWidth
          value={prefs.maxAgentTurns}
          onChange={(e) => onChange({ ...prefs, maxAgentTurns: e.target.value.replace(/\D/g, '') })}
          placeholder="No limit"
          helperText="Count completed agent turns (each /agent run until done). Positive integer only."
          inputProps={{ inputMode: 'numeric' }}
        />

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField
            label="Maximum agent time"
            size="small"
            fullWidth
            value={prefs.maxAgentTimeValue}
            onChange={(e) => onChange({ ...prefs, maxAgentTimeValue: e.target.value })}
            placeholder="No limit"
            helperText="Wall-clock time across agent turns in this session."
            inputProps={{ inputMode: 'decimal' }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="agent-max-time-unit">Unit</InputLabel>
            <Select
              labelId="agent-max-time-unit"
              label="Unit"
              value={unit}
              onChange={(e) =>
                onChange({ ...prefs, maxAgentTimeUnit: e.target.value as AgentTimeUnit })
              }
            >
              {units.map((u) => (
                <MenuItem key={u.value} value={u.value}>
                  {u.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        <TextField
          label={brightDateMode ? 'Agent shutdown at (BD)' : 'Agent shutdown date/time'}
          size="small"
          fullWidth
          type={brightDateMode ? 'text' : 'datetime-local'}
          value={prefs.shutdownAt}
          onChange={(e) => onChange({ ...prefs, shutdownAt: e.target.value })}
          placeholder={brightDateMode ? `After now (BD ${nowBd})` : 'No limit'}
          helperText={
            brightDateMode
              ? `BrightDate absolute BD (must be greater than now ≈ ${nowBd}).`
              : 'Local date/time in the future; agent sends blocked after this moment.'
          }
          InputLabelProps={brightDateMode ? undefined : { shrink: true }}
        />
      </Stack>

      <Alert severity="info" sx={{ mt: 2 }}>
        Shell command allowlists (e.g. allow <code>ls</code>, partial <code>yarn</code>) are not
        enforced in the UI yet — configure timeouts in cecli agent config; upstream allowlist is
        tracked on the roadmap.
      </Alert>
    </Paper>
  )
}
