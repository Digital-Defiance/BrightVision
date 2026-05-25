import { Alert, Stack, Typography } from '@mui/material'
import type { VisionClientCommandId } from '../../ipc/visionClientCommands'
import type { OllamaModelsSnapshot } from '../../ipc/localLlm'
import { OllamaModelsTable } from './OllamaModelsTable'

interface OllamaStatusMessageProps {
  command: VisionClientCommandId
  snapshot: OllamaModelsSnapshot
}

export function OllamaStatusMessage({ command, snapshot }: OllamaStatusMessageProps) {
  const tag = snapshot.configuredTag?.trim() ?? ''
  const showPs = command === 'ps' || command === 'models'
  const showTags = command === 'tags' || command === 'models'

  return (
    <Stack spacing={1} data-testid="ollama-status-message" sx={{ pr: 3 }}>
      <Typography variant="subtitle2" fontWeight={700}>
        Ollama status
        {tag ? (
          <>
            {' '}
            <Typography component="span" variant="caption" color="text.secondary">
              (Settings tag: {tag}
              {snapshot.configuredInPs ? ', in /api/ps' : ', not in /api/ps'})
            </Typography>
          </>
        ) : null}
      </Typography>
      {!snapshot.reachable && (
        <Alert severity="warning" variant="outlined">
          Ollama not reachable at {snapshot.ollamaHost}. Start Ollama or check Settings → Ollama
          API base.
        </Alert>
      )}
      {showTags && (
        <OllamaModelsTable
          title="/api/tags — pulled models"
          host={`${snapshot.ollamaHost}/api/tags`}
          rows={snapshot.tagsRows ?? []}
          emptyLabel="No models in /api/tags (run ollama pull or Local LLM → Start)"
          highlightTag={tag || undefined}
        />
      )}
      {showPs && (
        <OllamaModelsTable
          title="/api/ps — loaded in RAM"
          host={`${snapshot.ollamaHost}/api/ps`}
          rows={snapshot.psRows ?? []}
          emptyLabel="No models in /api/ps (empty — model may have unloaded; use Local LLM → Start)"
          highlightTag={tag || undefined}
        />
      )}
    </Stack>
  )
}
