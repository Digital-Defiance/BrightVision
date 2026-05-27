import { Box, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import {
  FONT_PRESET_LABELS,
  resolveAppearanceFonts,
  type AppearanceConfig,
  type FontPresetId,
} from '../../theme/appearance'

const PRESET_ORDER: FontPresetId[] = [
  'inter',
  'system-ui',
  'glass-tty',
  'jetbrains',
  'fira',
  'system-mono',
  'custom',
]

interface AppearanceSectionProps {
  appearance: AppearanceConfig
  onChange: (next: AppearanceConfig) => void
}

function FontRow({
  label,
  presetKey,
  customKey,
  appearance,
  onChange,
  sample,
}: {
  label: string
  presetKey: 'uiFont' | 'chatFont' | 'terminalFont'
  customKey: 'uiFontCustom' | 'chatFontCustom' | 'terminalFontCustom'
  appearance: AppearanceConfig
  onChange: (next: AppearanceConfig) => void
  sample: string
}) {
  const preset = appearance[presetKey]
  const fonts = resolveAppearanceFonts(appearance)
  const previewFont =
    presetKey === 'uiFont' ? fonts.ui : presetKey === 'chatFont' ? fonts.chat : fonts.terminal

  return (
    <Stack spacing={1}>
      <TextField
        select
        label={label}
        size="small"
        fullWidth
        value={preset}
        onChange={(e) =>
          onChange({ ...appearance, [presetKey]: e.target.value as FontPresetId })
        }
      >
        {PRESET_ORDER.map((id) => (
          <MenuItem key={id} value={id}>
            {FONT_PRESET_LABELS[id]}
          </MenuItem>
        ))}
      </TextField>
      {preset === 'custom' && (
        <TextField
          label="Custom font-family"
          size="small"
          fullWidth
          value={appearance[customKey]}
          onChange={(e) => onChange({ ...appearance, [customKey]: e.target.value })}
          placeholder='"My Font", monospace'
          helperText="CSS font-family value (comma-separated)."
        />
      )}
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderRadius: 1,
          bgcolor: 'action.hover',
          border: 1,
          borderColor: 'divider',
          fontFamily: previewFont,
          fontSize: presetKey === 'uiFont' ? '0.875rem' : '0.85rem',
          whiteSpace: 'pre-wrap',
        }}
      >
        {sample}
      </Box>
    </Stack>
  )
}

export function AppearanceSection({ appearance, onChange }: AppearanceSectionProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="h6" fontWeight={600} gutterBottom>
        Appearance
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Chat defaults to <strong>Inter</strong> to match the BrightVision UI. Choose{' '}
        <strong>Glass TTY VT220</strong> for a retro terminal look. Save settings to persist.
      </Typography>
      <Stack spacing={2.5}>
        <FontRow
          label="UI font (chrome, Tasks, Git)"
          presetKey="uiFont"
          customKey="uiFontCustom"
          appearance={appearance}
          onChange={onChange}
          sample="BrightVision — workspace navigation and labels"
        />
        <FontRow
          label="Chat font (messages & input)"
          presetKey="chatFont"
          customKey="chatFontCustom"
          appearance={appearance}
          onChange={onChange}
          sample={'► **THINKING**\nConsidering your request.\n► **ANSWER**\nHere is the reply.'}
        />
        <FontRow
          label="Terminal font (Technical tab)"
          presetKey="terminalFont"
          customKey="terminalFontCustom"
          appearance={appearance}
          onChange={onChange}
          sample={'[Cecli] Tokens: 120 sent, 45 received\nEdited: src/App.tsx'}
        />
      </Stack>
    </Paper>
  )
}
