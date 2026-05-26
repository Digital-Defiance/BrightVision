import {
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import type { SuggestedFilesPrefs } from '../../theme/suggestedFilesPrefs'
import { PROCEED_AFTER_FILES_MESSAGE } from '../../theme/suggestedFilesPrefs'

interface SuggestedFilesSectionProps {
  prefs: SuggestedFilesPrefs
  onChange: (prefs: SuggestedFilesPrefs) => void
}

export function SuggestedFilesSection({ prefs, onChange }: SuggestedFilesSectionProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        Suggested files
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        When the model lists paths and asks you to add them, the tray above the chat input offers
        one-click add. Use these options only for turns that are waiting on context files — not for
        every path mention.
      </Typography>
      <Stack spacing={0.5}>
        <FormControlLabel
          control={
            <Switch
              checked={prefs.autoAddSuggested}
              onChange={(_, checked) => onChange({ ...prefs, autoAddSuggested: checked })}
              data-testid="pref-auto-add-suggested"
            />
          }
          label="Automatically add all suggested files when the model asks"
        />
        <FormControlLabel
          control={
            <Switch
              checked={prefs.autoProceedAfterAdd}
              onChange={(_, checked) => onChange({ ...prefs, autoProceedAfterAdd: checked })}
              disabled={!prefs.autoAddSuggested}
              data-testid="pref-auto-proceed-after-add"
            />
          }
          label={`Then send “${PROCEED_AFTER_FILES_MESSAGE}” to continue the turn`}
        />
      </Stack>
    </Paper>
  )
}
