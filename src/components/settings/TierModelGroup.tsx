import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import PsychologyIcon from '@mui/icons-material/Psychology'
import VisibilityIcon from '@mui/icons-material/Visibility'
import {
  Box,
  Chip,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { LocalLlmSnapshot, OllamaModelsSnapshot } from '../../ipc/localLlm'
import {
  hopperTierLabel,
  normalizeHopperTier,
  resolveHopperEnableThinking,
  type ModelCapabilities,
  type ModelHopperEntry,
  type ModelHopperTier,
} from '../../theme/modelHopper'
import { ModelAddPicker } from './ModelAddPicker'
import {
  ModelRouteTierDot,
  modelRouteTierBorderSx,
} from './ModelRouteTierIndicator'

export interface TierModelGroupProps {
  /** Tier label: 'fast', 'code', or 'think'. */
  tier: ModelHopperTier
  /** Model entries belonging to this tier. */
  entries: ModelHopperEntry[]
  /** Connected backend catalog (Ollama tags or LM Studio lms ls). */
  snapshot?: OllamaModelsSnapshot | null
  /** Parsed local-llm.env for env-var picks. */
  localLlmSnap?: LocalLlmSnapshot | null
  /** @deprecated Use snapshot.tagsRows via ModelAddPicker. */
  availableModels?: string[]
  /** Fired when a model's enabled state is toggled. */
  onToggle: (id: string, enabled: boolean) => void
  /** Fired when a model row is removed. */
  onRemove: (id: string) => void
  /** Fired when a new model is added to this tier. */
  onAdd: (entry: ModelHopperEntry) => void
  /** Fired when entries are reordered within the tier. */
  onReorder: (reorderedEntries: ModelHopperEntry[]) => void
  /** Fired when a model's capabilities are changed. */
  onCapabilityChange?: (id: string, capabilities: ModelCapabilities) => void
  /** Fired when a model's thinking toggle is changed. */
  onThinkingChange?: (id: string, enableThinking: boolean) => void
  /** Whether the entire group is disabled (e.g. during sync). */
  disabled?: boolean
}

/** Props for an individual sortable model row within a tier group. */
interface SortableModelRowProps {
  entry: ModelHopperEntry
  normalizedTier: ModelHopperTier
  disabled: boolean
  isRemoveDisabled: boolean
  isCodeTier: boolean
  entriesCount: number
  onToggle: (id: string, enabled: boolean) => void
  onRemove: (id: string) => void
  onCapabilityChange?: (id: string, capabilities: ModelCapabilities) => void
  onThinkingChange?: (id: string, enableThinking: boolean) => void
}

/** A single draggable model row using @dnd-kit/sortable. */
function SortableModelRow({
  entry,
  normalizedTier,
  disabled,
  isRemoveDisabled,
  isCodeTier,
  entriesCount,
  onToggle,
  onRemove,
  onCapabilityChange,
  onThinkingChange,
}: SortableModelRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id, disabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 0.75,
        borderRadius: 1,
        border: 1,
        borderColor: entry.enabled ? 'primary.dark' : 'divider',
        bgcolor: entry.enabled ? 'action.selected' : 'transparent',
        ...modelRouteTierBorderSx(theme, normalizedTier),
      })}
      data-testid={`tier-model-row-${entry.id}`}
    >
      {/* Drag handle */}
      <Box
        {...attributes}
        {...listeners}
        sx={{
          display: 'flex',
          alignItems: 'center',
          cursor: disabled ? 'default' : 'grab',
          color: 'text.secondary',
          '&:active': { cursor: disabled ? 'default' : 'grabbing' },
        }}
        aria-label={`Drag to reorder ${entry.label || entry.model || 'model'}`}
        data-testid={`tier-model-drag-${entry.id}`}
      >
        <DragIndicatorIcon fontSize="small" />
      </Box>

      {/* Enabled toggle — left side, matching flat layout */}
      <Tooltip title={entry.enabled ? 'Disable model' : 'Enable model'}>
        <Switch
          size="small"
          checked={entry.enabled}
          disabled={disabled}
          onChange={(_, checked) => onToggle(entry.id, checked)}
          inputProps={{
            'aria-label': `Toggle ${entry.label || entry.model || 'model'}`,
          }}
          data-testid={`tier-model-toggle-${entry.id}`}
        />
      </Tooltip>

      {/* Model tag / label */}
      <Typography
        variant="body2"
        fontFamily="monospace"
        fontSize="0.85rem"
        sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
        title={entry.model || entry.label}
      >
        {entry.label || entry.model || '(empty)'}
      </Typography>

      {/* Vision capability chip */}
      <Tooltip title={entry.capabilities?.vision ? 'Vision enabled — click to disable' : 'Enable vision/image input'}>
        <Chip
          icon={<VisibilityIcon />}
          label="Vision"
          size="small"
          color={entry.capabilities?.vision ? 'info' : 'default'}
          variant={entry.capabilities?.vision ? 'filled' : 'outlined'}
          disabled={disabled}
          onClick={() => {
            if (!onCapabilityChange) return
            const current = entry.capabilities ?? {}
            onCapabilityChange(entry.id, { ...current, vision: !current.vision })
          }}
          sx={{ opacity: entry.capabilities?.vision ? 1 : 0.5 }}
          data-testid={`tier-model-vision-${entry.id}`}
        />
      </Tooltip>

      {/* Think capability chip */}
      <Tooltip title={resolveHopperEnableThinking(entry) ? 'Thinking enabled — click to disable' : 'Enable LiteLLM thinking'}>
        <Chip
          icon={<PsychologyIcon />}
          label="Think"
          size="small"
          color={resolveHopperEnableThinking(entry) ? 'secondary' : 'default'}
          variant={resolveHopperEnableThinking(entry) ? 'filled' : 'outlined'}
          disabled={disabled}
          onClick={() => {
            if (!onThinkingChange) return
            onThinkingChange(entry.id, !resolveHopperEnableThinking(entry))
          }}
          sx={{ opacity: resolveHopperEnableThinking(entry) ? 1 : 0.5 }}
          data-testid={`tier-model-think-${entry.id}`}
        />
      </Tooltip>

      {/* Max context field */}
      <TextField
        size="small"
        type="number"
        placeholder="ctx"
        disabled={disabled}
        value={entry.capabilities?.maxContext ?? ''}
        onChange={(e) => {
          if (!onCapabilityChange) return
          const current = entry.capabilities ?? {}
          const val = e.target.value.trim()
          const maxContext = val ? parseInt(val, 10) : undefined
          onCapabilityChange(entry.id, {
            ...current,
            maxContext: maxContext && maxContext > 0 ? maxContext : undefined,
          })
        }}
        sx={{ width: 88 }}
        slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: '0.75rem', py: 0.5 } } }}
        data-testid={`tier-model-maxctx-${entry.id}`}
      />

      {/* Remove button */}
      <Tooltip
        title={
          isRemoveDisabled
            ? isCodeTier && entriesCount <= 1
              ? 'At least one code model required'
              : 'Disabled'
            : 'Remove model'
        }
      >
        <span>
          <IconButton
            size="small"
            disabled={isRemoveDisabled}
            aria-label={`Remove ${entry.label || entry.model || 'model'}`}
            onClick={() => onRemove(entry.id)}
            data-testid={`tier-model-remove-${entry.id}`}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  )
}

/**
 * Renders a tier heading with multiple model rows beneath it.
 * Used in the multi-model hopper UI when a tier has more than one model assigned.
 * Supports drag-to-reorder within the tier group via @dnd-kit/sortable.
 */
export function TierModelGroup({
  tier,
  entries,
  snapshot,
  localLlmSnap,
  onToggle,
  onRemove,
  onAdd,
  onReorder,
  onCapabilityChange,
  onThinkingChange,
  disabled = false,
}: TierModelGroupProps) {
  const normalizedTier = normalizeHopperTier(tier)
  const tierLabel = hopperTierLabel(normalizedTier)

  // Remove is disabled when only one model remains in the code tier
  const isCodeTier = normalizedTier === 'code'
  const isRemoveDisabled = disabled || (isCodeTier && entries.length <= 1)
  const existingModels = entries.map((e) => e.model)

  // DnD sensors: pointer (mouse/touch) + keyboard (a11y)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = entries.findIndex((e) => e.id === active.id)
    const newIndex = entries.findIndex((e) => e.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const reordered = arrayMove(entries, oldIndex, newIndex)
    onReorder(reordered)
  }

  const entryIds = entries.map((e) => e.id)

  return (
    <Box data-testid={`tier-model-group-${normalizedTier}`}>
      {/* Tier heading */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <ModelRouteTierDot tier={normalizedTier} width={12} height={12} />
        <Typography variant="subtitle2" fontWeight={600}>
          {tierLabel} Tier
        </Typography>
        <Typography variant="caption" color="text.secondary">
          ({entries.length} {entries.length === 1 ? 'model' : 'models'})
        </Typography>
      </Stack>

      {/* Model rows — sortable via drag */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={entryIds} strategy={verticalListSortingStrategy}>
          <Stack spacing={0.75} sx={{ pl: 1 }}>
            {entries.map((entry) => (
              <SortableModelRow
                key={entry.id}
                entry={entry}
                normalizedTier={normalizedTier}
                disabled={disabled}
                isRemoveDisabled={isRemoveDisabled}
                isCodeTier={isCodeTier}
                entriesCount={entries.length}
                onToggle={onToggle}
                onRemove={onRemove}
                onCapabilityChange={onCapabilityChange}
                onThinkingChange={onThinkingChange}
              />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>

      {/* Add model picker — backend catalog, env vars, or custom */}
      <Stack direction="row" spacing={1} sx={{ mt: 1, pl: 1 }}>
        <ModelAddPicker
          tier={normalizedTier}
          existingModels={existingModels}
          snapshot={snapshot}
          localLlmSnap={localLlmSnap}
          disabled={disabled}
          includeSessionCode={isCodeTier}
          defaultEnabled
          label="Add model"
          testId={`tier-model-add-select-${normalizedTier}`}
          onAdd={onAdd}
        />
      </Stack>
    </Box>
  )
}
