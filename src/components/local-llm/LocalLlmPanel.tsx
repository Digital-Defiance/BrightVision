import MemoryIcon from '@mui/icons-material/Memory'
import {
  Alert,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import type { VisionConfig } from '../../ipc/config'
import { isLocalBackendVisionModel, localLlmListLabels } from '../../ipc/localLlm'
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

  if (!isLocalBackendVisionModel(config.model, backend)) {
    return (
      <Alert severity="info" sx={{ mb: compact ? 0 : 2 }}>
        LLM model does not match the active local backend (
        {backend === 'lmstudio' ? (
          <>
            use <code>openai/&lt;modelKey&gt;</code> from <code>lms ls --json</code>
          </>
        ) : (
          <>
            use <code>ollama_chat/…</code>
          </>
        )}
        ).
      </Alert>
    )
  }

  if (!modelTag) {
    return null
  }

  const labels = localLlmListLabels(backend)
  const showModelSnapshot =
    modelsSnapshot &&
    (capabilities.supportsVramQuery || backend === 'lmstudio')

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
          {!capabilities.supportsVramQuery && backend !== 'lmstudio' && (
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
          {backend === 'lmstudio' ? (
            <>
              Uses <code>lms load</code> to preload when the model is not already in{' '}
              <code>lms ps</code>. Model keys come from env files and Settings above.
            </>
          ) : capabilities.supportsModelPull ? (
            <>
              Starts Ollama if needed, pulls your tag, and preloads with{' '}
              <code>keep_alive: -1</code> only when the model is not already in{' '}
              <code>/api/ps</code>. Host and model tag come from env files and Settings above.
            </>
          ) : (
            <>
              Model lifecycle is managed by your external runtime (<code>{backend}</code>).
            </>
          )}
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={0.75} alignItems="center">
          {statusChip(status?.ollamaRunning ?? false, backend === 'lmstudio' ? 'lms up' : 'Ollama up', backend === 'lmstudio' ? 'lms down' : 'Ollama down')}
          {statusChip(status?.modelPulled ?? false, 'On disk', 'Not on disk')}
          {statusChip(
            modelsSnapshot?.configuredInPs ?? status?.modelLoaded ?? false,
            labels.loadedChipYes,
            labels.loadedChipNo
          )}
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {modelTag} @ {ollamaHost}
          </Typography>
        </Stack>
        {showModelSnapshot && (
          <Paper
            variant="outlined"
            data-testid="ollama-models-snapshot"
            sx={{ p: 1.25, bgcolor: 'action.hover' }}
          >
            <Typography variant="caption" fontWeight={600} display="block" gutterBottom>
              {backend === 'lmstudio' ? 'LM Studio models' : 'Ollama models'} (Settings tag:{' '}
              {modelsSnapshot.configuredTag})
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
              {`${labels.tagsTitle}\n${modelsSnapshot.tagsText}\n\n${labels.psTitle}\n${modelsSnapshot.psText}`}
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
