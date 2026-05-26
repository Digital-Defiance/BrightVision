import { Button, FormControlLabel, Paper, Stack, Switch, Typography } from '@mui/material'
import {
  DEFAULT_THINKING_TIMING_PREFS,
  type ThinkingTimingPrefs,
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
