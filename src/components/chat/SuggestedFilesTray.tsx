import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd'
import {
  Box,
  Button,
  Chip,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material'
import type { SuggestedFilesPrefs } from '../../theme/suggestedFilesPrefs'

export interface SuggestedFilesTrayProps {
  paths: string[]
  disabled?: boolean
  isBusy?: boolean
  /** Model asked to add files — show “Add all & proceed” prominently. */
  awaitingProceed?: boolean
  prefs?: SuggestedFilesPrefs
  onPrefsChange?: (prefs: SuggestedFilesPrefs) => void
  onAddOne: (path: string) => void
  onAddAll: () => void
  onAddAllAndProceed?: () => void
  onQueueAdds: () => void
  onDismiss: (path: string) => void
  onClearAll: () => void
}

export function SuggestedFilesTray({
  paths,
  disabled = false,
  isBusy = false,
  awaitingProceed = false,
  prefs,
  onPrefsChange,
  onAddOne,
  onAddAll,
  onAddAllAndProceed,
  onQueueAdds,
  onDismiss,
  onClearAll,
}: SuggestedFilesTrayProps) {
  if (paths.length === 0) return null

  const showProceed = awaitingProceed && Boolean(onAddAllAndProceed)

  return (
    <Box
      data-testid="suggested-files-tray"
      sx={{
        px: 1,
        pt: 0.5,
        pb: 0,
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'action.hover',
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary" component="span">
          {awaitingProceed
            ? `Suggested files (${paths.length}) — model is waiting for context`
            : `Suggested files (${paths.length})`}
        </Typography>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap justifyContent="flex-end">
          <Button
            size="small"
            variant="text"
            disabled={disabled}
            onClick={onClearAll}
            data-testid="suggested-files-clear"
          >
            Clear
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={disabled}
            startIcon={<AddIcon fontSize="small" />}
            onClick={onAddAll}
            data-testid="suggested-files-add-all"
          >
            Add all
          </Button>
          {showProceed && (
            <Button
              size="small"
              variant="contained"
              color="primary"
              disabled={disabled}
              startIcon={<PlayArrowIcon fontSize="small" />}
              onClick={onAddAllAndProceed}
              data-testid="suggested-files-add-all-proceed"
            >
              Add all &amp; proceed
            </Button>
          )}
          {isBusy && !showProceed && (
            <Button
              size="small"
              variant="contained"
              disabled={disabled}
              startIcon={<PlaylistAddIcon fontSize="small" />}
              onClick={onQueueAdds}
              data-testid="suggested-files-queue-adds"
            >
              Add while busy
            </Button>
          )}
        </Stack>
      </Stack>
      <Stack direction="row" flexWrap="wrap" gap={0.5} useFlexGap sx={{ mb: 0.5 }}>
        {paths.map((path) => (
          <Tooltip key={path} title="Click to add · × to dismiss">
            <Chip
              size="small"
              label={path}
              disabled={disabled}
              clickable={!disabled}
              onClick={() => onAddOne(path)}
              data-testid={`suggested-file-chip-${path.replace(/\//g, '--')}`}
              onDelete={disabled ? undefined : () => onDismiss(path)}
              deleteIcon={
                <IconButton size="small" aria-label={`Dismiss ${path}`}>
                  <CloseIcon fontSize="inherit" />
                </IconButton>
              }
              sx={{
                maxWidth: '100%',
                '& .MuiChip-label': { fontFamily: 'monospace', fontSize: '0.75rem' },
              }}
            />
          </Tooltip>
        ))}
      </Stack>
      {prefs && onPrefsChange && (
        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ pb: 0.5 }}>
          <FormControlLabel
            sx={{ m: 0 }}
            control={
              <Switch
                size="small"
                checked={prefs.autoAddSuggested}
                disabled={disabled}
                onChange={(_, checked) =>
                  onPrefsChange({
                    ...prefs,
                    autoAddSuggested: checked,
                    autoProceedAfterAdd: checked ? prefs.autoProceedAfterAdd : false,
                  })
                }
                data-testid="tray-auto-add-suggested"
              />
            }
            label={
              <Typography variant="caption" color="text.secondary">
                Auto-add when model asks
              </Typography>
            }
          />
          <FormControlLabel
            sx={{ m: 0 }}
            control={
              <Switch
                size="small"
                checked={prefs.autoProceedAfterAdd}
                disabled={disabled || !prefs.autoAddSuggested}
                onChange={(_, checked) =>
                  onPrefsChange({ ...prefs, autoProceedAfterAdd: checked })
                }
                data-testid="tray-auto-proceed"
              />
            }
            label={
              <Typography variant="caption" color="text.secondary">
                Auto-send proceed
              </Typography>
            }
          />
        </Stack>
      )}
    </Box>
  )
}
