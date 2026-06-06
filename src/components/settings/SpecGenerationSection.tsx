import { FormControl, InputLabel, MenuItem, Select, Stack, Typography } from '@mui/material'
import {
  formatSpecGenTimeoutLabel,
  SPEC_GEN_TIMEOUT_PRESETS,
  type SpecGenTimeoutPrefs,
} from '../../theme/specGenTimeoutPrefs'

interface SpecGenerationSectionProps {
  prefs: SpecGenTimeoutPrefs
  onChange: (prefs: SpecGenTimeoutPrefs) => void
}

export function SpecGenerationSection({ prefs, onChange }: SpecGenerationSectionProps) {
  const presetKey =
    prefs.wallTimeoutS === SPEC_GEN_TIMEOUT_PRESETS.extended.wallTimeoutS &&
    prefs.turnTimeoutS === SPEC_GEN_TIMEOUT_PRESETS.extended.turnTimeoutS
      ? 'extended'
      : prefs.wallTimeoutS === SPEC_GEN_TIMEOUT_PRESETS.default.wallTimeoutS &&
          prefs.turnTimeoutS === SPEC_GEN_TIMEOUT_PRESETS.default.turnTimeoutS
        ? 'default'
        : 'custom'

  return (
    <Stack spacing={1.5} data-testid="spec-generation-settings">
      <Typography variant="subtitle2">Spec generation timeouts</Typography>
      <Typography variant="body2" color="text.secondary">
        Background Generate requirements / design / tasks runs on the Vision API. Large local
        models on rich specs often need the extended preset (40 min job, 20 min per LLM turn).
      </Typography>
      <FormControl size="small" sx={{ maxWidth: 360 }}>
        <InputLabel id="spec-gen-timeout-preset">Preset</InputLabel>
        <Select
          labelId="spec-gen-timeout-preset"
          label="Preset"
          value={presetKey}
          onChange={(e) => {
            const key = e.target.value
            if (key === 'extended') {
              onChange({
                wallTimeoutS: SPEC_GEN_TIMEOUT_PRESETS.extended.wallTimeoutS,
                turnTimeoutS: SPEC_GEN_TIMEOUT_PRESETS.extended.turnTimeoutS,
              })
            } else if (key === 'default') {
              onChange({
                wallTimeoutS: SPEC_GEN_TIMEOUT_PRESETS.default.wallTimeoutS,
                turnTimeoutS: SPEC_GEN_TIMEOUT_PRESETS.default.turnTimeoutS,
              })
            }
          }}
        >
          <MenuItem value="default">{SPEC_GEN_TIMEOUT_PRESETS.default.label}</MenuItem>
          <MenuItem value="extended">{SPEC_GEN_TIMEOUT_PRESETS.extended.label}</MenuItem>
          {presetKey === 'custom' ? (
            <MenuItem value="custom" disabled>
              Custom ({formatSpecGenTimeoutLabel(prefs)})
            </MenuItem>
          ) : null}
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary">
        Current: {formatSpecGenTimeoutLabel(prefs)} — applied on the next generate-spec job (no
        Vision API restart needed).
      </Typography>
    </Stack>
  )
}
