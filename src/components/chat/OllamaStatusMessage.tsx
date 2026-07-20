import { Alert, Stack, Typography } from '@mui/material'
import type { VisionClientCommandId } from '../../ipc/visionClientCommands'
import { localLlmListLabels, type OllamaModelsSnapshot } from '../../ipc/localLlm'
import type { ModelHopperTier } from '../../theme/modelHopper'
import { OllamaModelsTable } from './OllamaModelsTable'

interface OllamaStatusMessageProps {
  command: VisionClientCommandId
  snapshot: OllamaModelsSnapshot
  /** Active local LLM backend (defaults to Ollama labels). */
  backend?: string | null
  /** Model name → hopper tier, for row color-coding. */
  tierMap?: Record<string, ModelHopperTier>
}

export function OllamaStatusMessage({
  command,
  snapshot,
  backend,
  tierMap,
}: OllamaStatusMessageProps) {
  const labels = localLlmListLabels(backend ?? snapshot.backend)
  const tag = snapshot.configuredTag?.trim() ?? ''
  const showPs = command === 'ps' || command === 'models'
  const showTags = command === 'tags' || command === 'models'

  return (
    <Stack spacing={1} data-testid="ollama-status-message" sx={{ pr: 3 }}>
      <Typography variant="subtitle2" fontWeight={700}>
        {labels.statusTitle}
        {tag ? (
          <>
            {' '}
            <Typography component="span" variant="caption" color="text.secondary">
              (Settings tag: {tag}
              {snapshot.configuredInPs
                ? `, ${labels.configuredInPs}`
                : `, ${labels.configuredNotInPs}`}
              )
            </Typography>
          </>
        ) : null}
      </Typography>
      {!snapshot.reachable && (
        <Alert severity="warning" variant="outlined">
          {labels.unreachable}
        </Alert>
      )}
      {showTags && (
        <OllamaModelsTable
          title={labels.tagsTitle}
          host={labels.tagsHost}
          rows={snapshot.tagsRows ?? []}
          emptyLabel={labels.tagsEmpty}
          highlightTag={tag || undefined}
          tierMap={tierMap}
        />
      )}
      {showPs && (
        <OllamaModelsTable
          title={labels.psTitle}
          host={labels.psHost}
          rows={snapshot.psRows ?? []}
          emptyLabel={labels.psEmpty}
          highlightTag={tag || undefined}
          tierMap={tierMap}
          variant={(backend ?? snapshot.backend) === 'lmstudio' ? 'lmstudio' : 'ollama'}
        />
      )}
    </Stack>
  )
}
