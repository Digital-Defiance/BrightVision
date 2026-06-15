import MemoryIcon from '@mui/icons-material/Memory'
import {
  Alert,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import type { VisionConfig } from '../../ipc/config'
import { isOllamaVisionModel } from '../../ipc/localLlm'
import { isTauriRuntime } from '../../ipc/isTauri'
import { useLocalLlmControls, type LocalLlmControls } from '../../hooks/useLocalLlmControls'
import { LocalLlmActionButtons } from './LocalLlmActionButtons'

interface LocalLlmPanelViewProps {
  config: VisionConfig
  onManageChange: (manage: boolean) => void
  compact?: boolean
  controls: LocalLlmControls
  hideActions?: boolean
}

function statusChip(ok: boolean, yes: string, no: string) {
  return (
    <Chip
      size="small"
      label={ok ? yes : no}
      color={ok ? 'success' : 'default'}
      variant={ok ? 'filled' : 'outlined'}
    />
  )
}

function LocalLlmPanelView({
  config,
  onManageChange,
  compact = false,
  controls,
  hideActions = false,
}: LocalLlmPanelViewProps) {
  const {
    ollamaHost,
    modelTag,
    status,
    modelsSnapshot,
    canRun,
    capabilities,
    backend,
    backendUnavailable,
    busy,
  } = controls

  if (!isTauriRuntime()) {
    return (
      <Alert severity="info" sx={{ mb: compact ? 0 : 2 }}>
        Local LLM management is built into the desktop app. On web, start Ollama and
        preload your model manually, then match Settings to <code>ollama_chat/&lt;tag&gt;</code>.
      </Alert>
    )
  }

  if (!isOllamaVisionModel(config.model)) {
    return (
      <Alert severity="info" sx={{ mb: compact ? 0 : 2 }}>
        LLM model is not an Ollama provider (<code>ollama_chat/…</code>). Local LLM controls apply
        when using a local Ollama model.
      </Alert>
    )
  }

  if (!modelTag) {
    return null
  }

  return (
    <Paper variant="outlined" sx={{ p: compact ? 1.5 : 2, mb: compact ? 0 : 2 }}>
      <Stack spacing={1.5}>
        {backendUnavailable && (
          <Alert severity="error" data-testid="local-llm-backend-unavailable">
            Backend unavailable
          </Alert>
        )}
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
          <MemoryIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" fontWeight={700}>
            Local LLM
          </Typography>
          <Chip size="small" label="built-in" variant="outlined" color="primary" />
          {backend !== 'ollama' && (
            <Chip size="small" label={backend} variant="outlined" color="info" />
          )}
          {!capabilities.supportsVramQuery && (
            <Chip
              size="small"
              label="Managed externally"
              variant="outlined"
              color="warning"
              data-testid="local-llm-managed-externally"
            />
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {capabilities.supportsModelPull
            ? 'Starts Ollama if needed, pulls your tag, and preloads with '
            : 'Model lifecycle is managed by your external runtime ('}
          {capabilities.supportsModelPull ? (
            <>
              <code>keep_alive: -1</code> only when the model is not already in{' '}
              <code>/api/ps</code>. Host and model tag come from env files and Settings above.
            </>
          ) : (
            <>
              <code>{backend}</code>). VRAM and model lists are not queried from BrightVision.
            </>
          )}
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={0.75} alignItems="center">
          {statusChip(status?.ollamaRunning ?? false, 'Ollama up', 'Ollama down')}
          {statusChip(status?.modelPulled ?? false, 'Pulled', 'Not pulled')}
          {statusChip(
            modelsSnapshot?.configuredInPs ?? status?.modelLoaded ?? false,
            'In /api/ps',
            'Not in /api/ps'
          )}
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {modelTag} @ {ollamaHost}
          </Typography>
        </Stack>
        {modelsSnapshot && capabilities.supportsVramQuery && (
          <Paper
            variant="outlined"
            data-testid="ollama-models-snapshot"
            sx={{ p: 1.25, bgcolor: 'action.hover' }}
          >
            <Typography variant="caption" fontWeight={600} display="block" gutterBottom>
              Ollama models (Settings tag: {modelsSnapshot.configuredTag})
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              component="pre"
              sx={{
                m: 0,
                fontFamily: 'monospace',
                fontSize: '0.72rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {`/api/tags (pulled)\n${modelsSnapshot.tagsText}\n\n/api/ps (loaded in RAM)\n${modelsSnapshot.psText}`}
            </Typography>
          </Paper>
        )}
        {!hideActions && canRun && (
          <LocalLlmActionButtons controls={controls} showPull={capabilities.supportsModelPull} />
        )}
        <Stack direction="row" justifyContent="flex-end">
          <Chip
            size="small"
            label={config.manageLocalLlm ? 'Auto before session' : 'Manual only'}
            color={config.manageLocalLlm ? 'primary' : 'default'}
            onClick={() => !backendUnavailable && !busy && onManageChange(!config.manageLocalLlm)}
            sx={{ cursor: backendUnavailable || busy ? 'default' : 'pointer' }}
            disabled={backendUnavailable || busy}
          />
        </Stack>
      </Stack>
    </Paper>
  )
}

interface LocalLlmPanelProps {
  config: VisionConfig
  onManageChange: (manage: boolean) => void
  onLogLines?: (lines: string[]) => void
  compact?: boolean
  controls?: LocalLlmControls
  hideActions?: boolean
}

export function LocalLlmPanel({
  controls: externalControls,
  onLogLines,
  ...rest
}: LocalLlmPanelProps) {
  if (externalControls) {
    return <LocalLlmPanelView {...rest} controls={externalControls} />
  }
  return <LocalLlmPanelWithHook {...rest} onLogLines={onLogLines} />
}

function LocalLlmPanelWithHook({
  config,
  onLogLines,
  ...rest
}: Omit<LocalLlmPanelProps, 'controls'>) {
  const controls = useLocalLlmControls(config, onLogLines)
  return <LocalLlmPanelView config={config} controls={controls} {...rest} />
}
