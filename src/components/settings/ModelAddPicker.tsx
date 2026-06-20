import {
  FormControl,
  InputLabel,
  ListSubheader,
  MenuItem,
  Select,
  Typography,
} from '@mui/material'
import type { LocalLlmSnapshot, OllamaModelsSnapshot } from '../../ipc/localLlm'
import {
  backendLabel,
  buildModelPickOptions,
  findModelPickOption,
  hopperEntryFromPick,
  type ModelPickOption,
} from '../../utils/hopperModelCatalog'
import type { ModelHopperEntry, ModelHopperTier } from '../../theme/modelHopper'

export interface ModelAddPickerProps {
  tier: ModelHopperTier
  existingModels: readonly string[]
  snapshot?: OllamaModelsSnapshot | null
  localLlmSnap?: LocalLlmSnapshot | null
  disabled?: boolean
  label?: string
  testId?: string
  includeSessionCode?: boolean
  defaultEnabled?: boolean
  onAdd: (entry: ModelHopperEntry) => void
}

function groupLabel(options: ModelPickOption[], kind: ModelPickOption['kind']): ModelPickOption[] {
  return options.filter((o) => o.kind === kind)
}

export function ModelAddPicker({
  tier,
  existingModels,
  snapshot,
  localLlmSnap,
  disabled = false,
  label = 'Add model',
  testId,
  includeSessionCode = false,
  defaultEnabled = false,
  onAdd,
}: ModelAddPickerProps) {
  const backend = snapshot?.backend ?? localLlmSnap?.backend ?? 'ollama'
  const options = buildModelPickOptions({
    tier,
    snapshot,
    localLlmSnap,
    existingModels,
    includeSessionCode,
  })
  const catalog = groupLabel(options, 'catalog')
  const env = groupLabel(options, 'env')
  const other = options.filter((o) => o.kind === 'custom' || o.kind === 'session-code')
  const snapshotHint =
    snapshot == null
      ? 'Refresh local LLM paths to load models from your backend.'
      : !snapshot.reachable
        ? snapshot.tagsText.trim() || 'Backend not reachable — check lms/Ollama and refresh.'
        : catalog.length === 0
          ? `All ${backendLabel(backend)} models in this tier are already in the hopper, or the catalog is empty.`
          : null

  return (
    <FormControl size="small" sx={{ minWidth: 220 }} disabled={disabled}>
      <InputLabel id={`${testId ?? 'model-add'}-label`} shrink>
        {label}
      </InputLabel>
      <Select
        labelId={`${testId ?? 'model-add'}-label`}
        label={label}
        value=""
        displayEmpty
        notched
        data-testid={testId}
        onChange={(e) => {
          const value = String(e.target.value)
          if (!value) return
          const option = findModelPickOption(options, value)
          if (!option) return
          onAdd(hopperEntryFromPick(option, defaultEnabled))
        }}
      >
        <MenuItem value="">
          <em>Select model…</em>
        </MenuItem>
        {catalog.length > 0 && (
          <ListSubheader>{backendLabel(backend)}</ListSubheader>
        )}
        {catalog.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
            {option.detail ? (
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                {option.detail}
              </Typography>
            ) : null}
          </MenuItem>
        ))}
        {env.length > 0 && <ListSubheader>From local-llm.env</ListSubheader>}
        {env.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
            {option.detail ? (
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                {option.detail}
              </Typography>
            ) : null}
          </MenuItem>
        ))}
        {other.length > 0 && <ListSubheader>Other</ListSubheader>}
        {other.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
      {snapshotHint && !disabled ? (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {snapshotHint}
        </Typography>
      ) : null}
    </FormControl>
  )
}
