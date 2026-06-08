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
import { effectiveRouterEnabled } from '../../theme/modelRouterPrefs'
import { resolveHopperModels, syncSessionModelToHopper } from '../../theme/modelHopper'
import { ModelHopperEditor } from './ModelHopperEditor'
import { ModelRouteTierLegend, ModelRouteTierRouteLine } from './ModelRouteTierIndicator'

interface ModelRouterSectionProps {
  prefs: ModelRouterPrefs
  sessionModel: string
  ollamaSnapshot?: OllamaModelsSnapshot | null
  /** `MODEL_ROUTER` from local-llm env (0 = opt-out). */
  modelRouterEnv?: boolean | null
  onChange: (prefs: ModelRouterPrefs) => void
}

export function ModelRouterSection({
  prefs,
  sessionModel,
  ollamaSnapshot,
  modelRouterEnv,
  onChange,
}: ModelRouterSectionProps) {
  const resolved = resolveHopperModels(prefs.models, sessionModel)
  const routerOn = effectiveRouterEnabled(prefs, sessionModel, modelRouterEnv)
  const routerReady = Boolean(routerOn && resolved.fast)
  // Gate the editable hopper controls on the user's raw intent (the toggle),
  // not on `routerOn`. `routerOn`/`effectiveRouterEnabled` also requires an
  // enabled fast model — gating the editor on it created a dead-end where the
  // controls used to add a fast model were themselves disabled until one existed.
  // Env opt-out (MODEL_ROUTER=0) still force-disables.
  const routerIntent = modelRouterEnv === false ? false : prefs.enabled

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="model-router-settings">
      <Typography variant="subtitle2" gutterBottom>
        Local model router
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Classify each prompt (turn context + keywords), then pick from the enabled models in the
        hopper. Tier colors match the left edge on chat replies. Router turns on automatically for
        Ollama when a fast tier model is enabled; set <code>MODEL_ROUTER=0</code> in local-llm.env
        to opt out.
      </Typography>
      <ModelRouteTierLegend />
      <Stack spacing={2}>
        <FormControlLabel
          control={
            <Switch
              checked={routerIntent}
              onChange={(_, checked) =>
                onChange({
                  ...prefs,
                  enabled: checked,
                  routerEnabledUserSet: true,
                })
              }
              data-testid="pref-model-router-enabled"
            />
          }
          label="Enable dynamic model routing (local Ollama only)"
        />

        <ModelHopperEditor
          models={prefs.models}
          disabled={!routerIntent}
          sessionModel={sessionModel}
          ollamaSnapshot={ollamaSnapshot}
          onChange={(models) => onChange({ ...prefs, models })}
        />
        <Button
          size="small"
          variant="text"
          disabled={!routerIntent}
          onClick={() => onChange({ ...prefs, models: syncSessionModelToHopper(prefs.models, sessionModel) })}
          data-testid="model-hopper-sync-session"
        >
          Use session LLM as code slot
        </Button>

        {routerIntent && !resolved.fast && (
          <Typography variant="body2" color="warning.main" data-testid="model-hopper-warning">
            Turn on at least one <strong>fast</strong> tier model in the hopper.
          </Typography>
        )}
        {routerReady && (
          <Stack direction="row" flexWrap="wrap" gap={1.5} useFlexGap data-testid="model-router-active-routes">
            <ModelRouteTierRouteLine tier="fast" model={resolved.fast!} />
            <ModelRouteTierRouteLine tier="code" model={resolved.code} />
            {resolved.think ? (
              <ModelRouteTierRouteLine tier="think" model={resolved.think} />
            ) : null}
          </Stack>
        )}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField
            label="Code/think keep-alive (seconds)"
            size="small"
            type="number"
            disabled={!routerIntent}
            value={prefs.keepAliveHeavySec}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              onChange({
                ...prefs,
                keepAliveHeavySec: Number.isFinite(n) ? (n === 0 ? -1 : n) : -1,
              })
            }}
            helperText="Use -1 for implement/agent (keeps code model loaded). 0 unloads between calls and causes empty Ollama responses."
            sx={{ flex: 1 }}
            inputProps={{ 'data-testid': 'pref-model-router-heavy-keep-alive' }}
          />
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField
            label="Fast tier if context below (tokens)"
            size="small"
            type="number"
            disabled={!routerIntent}
            value={prefs.tokenFastMax}
            onChange={(e) =>
              onChange({ ...prefs, tokenFastMax: parseInt(e.target.value, 10) || 4096 })
            }
            sx={{ flex: 1 }}
          />
          <TextField
            label="Think tier if context at/above (tokens)"
            size="small"
            type="number"
            disabled={!routerIntent}
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
              disabled={!routerIntent}
              onChange={(_, checked) => onChange({ ...prefs, escalateOnFailure: checked })}
              data-testid="pref-model-router-escalate"
            />
          }
          label="Auto-escalate fast→code→think when a tier stalls on a code/reasoning task"
        />
      </Stack>
    </Paper>
  )
}
