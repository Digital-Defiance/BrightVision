import {
  Button,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import { isTauriRuntime } from '../../ipc/isTauri'
import {
  DEFAULT_THINKING_TIMING_PREFS,
  type ThinkingTimingPrefs,
  type TimingResourceDisplay,
} from '../../theme/thinkingTimingPrefs'
import type { ThinkingStatsStore } from '../../utils/thinkingStats'
import { ThinkingStatsPanel } from './ThinkingStatsPanel'

interface ThinkingTimingSectionProps {
  prefs: ThinkingTimingPrefs
  statsStore: ThinkingStatsStore
  currentModel: string
  workingDir: string
  onChange: (next: ThinkingTimingPrefs) => void
  onClearModelStats: () => void
  onClearAllStats: () => void
  onCsvMessage?: (message: string, severity: 'info' | 'warning') => void
}

export function ThinkingTimingSection({
  prefs,
  statsStore,
  currentModel,
  workingDir,
  onChange,
  onClearModelStats,
  onClearAllStats,
  onCsvMessage,
}: ThinkingTimingSectionProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        Response & think timing
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        <strong>Response time</strong> is Send → done. <strong>Think time</strong> is only
        Thinking / Reasoning sections. History and statistics are stored locally per model.
      </Typography>
      <Stack spacing={0.5}>
        <FormControlLabel
          control={
            <Switch
              checked={prefs.brightDateMode}
              onChange={(_, v) => onChange({ ...prefs, brightDateMode: v })}
            />
          }
          label="BrightDate mode (BD / millidays for response time, ETA, and history)"
        />
        <FormControlLabel
          control={
            <Switch
              checked={prefs.showLiveTimer}
              onChange={(_, v) => onChange({ ...prefs, showLiveTimer: v })}
            />
          }
          label="Live Response / Think timer in top activity bar"
        />
        <FormControlLabel
          control={
            <Switch
              checked={prefs.showSectionDurations}
              onChange={(_, v) => onChange({ ...prefs, showSectionDurations: v })}
            />
          }
          label="Section duration on completed messages"
        />
        <FormControlLabel
          control={
            <Switch
              checked={prefs.showMessageTurnTotal}
              onChange={(_, v) => onChange({ ...prefs, showMessageTurnTotal: v })}
            />
          }
          label="Response & Think time on completed messages"
        />
        <FormControlLabel
          control={
            <Switch
              checked={prefs.showStatsInSettings}
              onChange={(_, v) => onChange({ ...prefs, showStatsInSettings: v })}
            />
          }
          label="Statistics & history in Settings"
        />
        {isTauriRuntime() && (
          <FormControl size="small" sx={{ minWidth: 220, mt: 0.5 }}>
            <InputLabel id="timing-resource-display-label">Resource columns</InputLabel>
            <Select
              labelId="timing-resource-display-label"
              label="Resource columns"
              value={prefs.resourceDisplay ?? 'avgPeak'}
              onChange={(e) =>
                onChange({
                  ...prefs,
                  resourceDisplay: e.target.value as TimingResourceDisplay,
                })
              }
              data-testid="timing-resource-display"
            >
              <MenuItem value="avgPeak">Avg / peak (default)</MenuItem>
              <MenuItem value="avg">Average only</MenuItem>
              <MenuItem value="peak">Peak only</MenuItem>
            </Select>
          </FormControl>
        )}
        <Button
          size="small"
          sx={{ alignSelf: 'flex-start', mt: 0.5 }}
          onClick={() => onChange({ ...DEFAULT_THINKING_TIMING_PREFS })}
        >
          Reset display defaults
        </Button>
      </Stack>
      {prefs.showStatsInSettings && (
        <ThinkingStatsPanel
          store={statsStore}
          currentModel={currentModel}
          workingDir={workingDir}
          timingPrefs={prefs}
          onTimingPrefsChange={onChange}
          onClearModel={onClearModelStats}
          onClearAll={onClearAllStats}
          onCsvSuccess={(msg) => onCsvMessage?.(msg, 'info')}
          onCsvError={(msg) => onCsvMessage?.(msg, 'warning')}
        />
      )}
    </Paper>
  )
}
