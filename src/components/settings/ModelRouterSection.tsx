import {
  Button,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import type { OllamaModelsSnapshot } from '../../ipc/localLlm'
import type { ModelRouterPrefs } from '../../theme/modelRouterPrefs'
import { resolveHopperModels, syncSessionModelToHopper } from '../../theme/modelHopper'
import { ModelHopperEditor } from './ModelHopperEditor'

interface ModelRouterSectionProps {
  prefs: ModelRouterPrefs
  sessionModel: string
  ollamaSnapshot?: OllamaModelsSnapshot | null
  onChange: (prefs: ModelRouterPrefs) => void
}

export function ModelRouterSection({
  prefs,
  sessionModel,
  ollamaSnapshot,
  onChange,
}: ModelRouterSectionProps) {
  const resolved = resolveHopperModels(prefs.models, sessionModel)
  const routerReady = Boolean(prefs.enabled && resolved.fast)

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="model-router-settings">
      <Typography variant="subtitle2" gutterBottom>
        Local model router
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Classify each prompt (token estimate + keywords), then pick from the enabled models in
        the hopper below. Swapping a 7B coder for ~30s beats a 27B model on a 20-minute typo fix.
      </Typography>
      <Stack spacing={2}>
        <FormControlLabel
          control={
            <Switch
              checked={prefs.enabled}
              onChange={(_, checked) => onChange({ ...prefs, enabled: checked })}
              data-testid="pref-model-router-enabled"
            />
          }
          label="Enable dynamic model tiering (local Ollama only)"
        />

        <ModelHopperEditor
          models={prefs.models}
          disabled={!prefs.enabled}
          sessionModel={sessionModel}
          ollamaSnapshot={ollamaSnapshot}
          onChange={(models) => onChange({ ...prefs, models })}
        />
        <Button
          size="small"
          variant="text"
          disabled={!prefs.enabled}
          onClick={() => onChange({ ...prefs, models: syncSessionModelToHopper(prefs.models, sessionModel) })}
          data-testid="model-hopper-sync-session"
        >
          Use session LLM as heavy slot
        </Button>

        {prefs.enabled && !resolved.fast && (
          <Typography variant="body2" color="warning.main" data-testid="model-hopper-warning">
            Turn on at least one <strong>fast</strong> tier model in the hopper.
          </Typography>
        )}
        {routerReady && (
          <Typography variant="caption" color="text.secondary" component="div">
            Active route: fast →{' '}
            <Typography component="span" fontFamily="monospace">
              {resolved.fast}
            </Typography>
            {' · '}
            heavy →{' '}
            <Typography component="span" fontFamily="monospace">
              {resolved.heavy}
            </Typography>
          </Typography>
        )}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField
            label="Fast tier if context below (tokens)"
            size="small"
            type="number"
            disabled={!prefs.enabled}
            value={prefs.tokenFastMax}
            onChange={(e) =>
              onChange({ ...prefs, tokenFastMax: parseInt(e.target.value, 10) || 4096 })
            }
            sx={{ flex: 1 }}
          />
          <TextField
            label="Heavy tier if context at/above (tokens)"
            size="small"
            type="number"
            disabled={!prefs.enabled}
            value={prefs.tokenHeavyMin}
            onChange={(e) =>
              onChange({ ...prefs, tokenHeavyMin: parseInt(e.target.value, 10) || 12000 })
            }
            sx={{ flex: 1 }}
          />
        </Stack>
        <FormControlLabel
          control={
            <Switch
              checked={prefs.escalateOnFailure}
              disabled={!prefs.enabled}
              onChange={(_, checked) => onChange({ ...prefs, escalateOnFailure: checked })}
              data-testid="pref-model-router-escalate"
            />
          }
          label="Auto-escalate to heavy when fast tier makes no edits on a code task"
        />
      </Stack>
    </Paper>
  )
}
