import AddIcon from '@mui/icons-material/Add'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import {
  Box,
  Button,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import type { OllamaModelsSnapshot } from '../../ipc/localLlm'
import { ollamaChatModelFromTag } from '../../ipc/localLlm'
import {
  createHopperEntry,
  moveHopperEntry,
  removeHopperEntry,
  updateHopperEntry,
  type ModelHopperEntry,
} from '../../theme/modelHopper'

interface ModelHopperEditorProps {
  models: ModelHopperEntry[]
  disabled?: boolean
  sessionModel: string
  ollamaSnapshot?: OllamaModelsSnapshot | null
  onChange: (models: ModelHopperEntry[]) => void
}

export function ModelHopperEditor({
  models,
  disabled = false,
  sessionModel,
  ollamaSnapshot,
  onChange,
}: ModelHopperEditorProps) {
  const ollamaTags = ollamaSnapshot?.tagsRows?.map((r) => r.name).filter(Boolean) ?? []

  return (
    <Stack spacing={1} data-testid="model-hopper-editor">
      <Typography variant="body2" color="text.secondary">
        Enable models in the hopper for the router to choose from. Order is priority (top first).
        Heavy rows with an empty id use{' '}
        <Typography component="span" fontFamily="monospace" fontSize="0.8rem">
          {sessionModel}
        </Typography>
        .
      </Typography>
      {models.map((entry, index) => (
        <Box
          key={entry.id}
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            alignItems: 'flex-start',
            p: 1,
            borderRadius: 1,
            border: 1,
            borderColor: entry.enabled ? 'primary.dark' : 'divider',
            bgcolor: entry.enabled ? 'action.selected' : 'transparent',
          }}
          data-testid={`model-hopper-row-${entry.id}`}
        >
          <FormControlLabel
            sx={{ m: 0, minWidth: 56 }}
            control={
              <Switch
                size="small"
                checked={entry.enabled}
                disabled={disabled}
                onChange={(_, checked) =>
                  onChange(updateHopperEntry(models, entry.id, { enabled: checked }))
                }
                inputProps={{
                  'aria-label': `Enable ${(entry.label ?? entry.model) || 'model'}`,
                }}
                data-testid={`model-hopper-enable-${entry.id}`}
              />
            }
            label=""
          />
          <FormControl size="small" sx={{ minWidth: 100 }} disabled={disabled}>
            <InputLabel id={`tier-${entry.id}`}>Tier</InputLabel>
            <Select
              labelId={`tier-${entry.id}`}
              label="Tier"
              value={entry.tier}
              onChange={(e) =>
                onChange(
                  updateHopperEntry(models, entry.id, {
                    tier: e.target.value === 'heavy' ? 'heavy' : 'fast',
                  })
                )
              }
            >
              <MenuItem value="fast">Fast</MenuItem>
              <MenuItem value="heavy">Heavy</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Label"
            disabled={disabled}
            value={entry.label ?? ''}
            onChange={(e) =>
              onChange(updateHopperEntry(models, entry.id, { label: e.target.value }))
            }
            sx={{ flex: '1 1 120px', minWidth: 100 }}
          />
          <TextField
            size="small"
            label="Model id"
            disabled={disabled || (entry.tier === 'heavy' && !entry.model)}
            placeholder={
              entry.tier === 'heavy' ? '(session model)' : 'ollama_chat/…'
            }
            value={entry.model}
            onChange={(e) =>
              onChange(updateHopperEntry(models, entry.id, { model: e.target.value }))
            }
            sx={{ flex: '2 1 200px', minWidth: 180 }}
            slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: '0.85rem' } } }}
          />
          <Stack direction="row" spacing={0.25}>
            <Tooltip title="Higher priority">
              <span>
                <IconButton
                  size="small"
                  disabled={disabled || index === 0}
                  aria-label="Move up"
                  onClick={() => onChange(moveHopperEntry(models, entry.id, -1))}
                >
                  <ArrowUpwardIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Lower priority">
              <span>
                <IconButton
                  size="small"
                  disabled={disabled || index === models.length - 1}
                  aria-label="Move down"
                  onClick={() => onChange(moveHopperEntry(models, entry.id, 1))}
                >
                  <ArrowDownwardIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Remove">
              <span>
                <IconButton
                  size="small"
                  disabled={disabled}
                  aria-label="Remove model"
                  onClick={() => onChange(removeHopperEntry(models, entry.id))}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Box>
      ))}
      <Stack direction="row" flexWrap="wrap" gap={1}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          disabled={disabled}
          onClick={() =>
            onChange([
              ...models,
              createHopperEntry({ tier: 'fast', model: '', label: 'New model' }),
            ])
          }
          data-testid="model-hopper-add"
        >
          Add model
        </Button>
        <Button
          size="small"
          variant="text"
          disabled={disabled}
          onClick={() =>
            onChange([
              ...models,
              createHopperEntry({
                tier: 'heavy',
                model: '',
                label: 'Session model',
                enabled: false,
              }),
            ])
          }
        >
          Add heavy slot
        </Button>
        {ollamaTags.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 200 }} disabled={disabled}>
            <InputLabel id="hopper-from-ollama">From Ollama tags</InputLabel>
            <Select
              labelId="hopper-from-ollama"
              label="From Ollama tags"
              value=""
              displayEmpty
              onChange={(e) => {
                const tag = e.target.value
                if (!tag) return
                onChange([
                  ...models,
                  createHopperEntry({
                    tier: 'fast',
                    model: ollamaChatModelFromTag(tag),
                    label: tag,
                    enabled: false,
                  }),
                ])
              }}
            >
              <MenuItem value="">
                <em>Select tag…</em>
              </MenuItem>
              {ollamaTags.map((tag) => (
                <MenuItem key={tag} value={tag}>
                  {tag}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Stack>
    </Stack>
  )
}
