import {
  Box,
  Chip,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { QUICK_COMMANDS, type VisionCommand } from '../../ipc/commands'

interface CommandAssistProps {
  commands: VisionCommand[]
  inputValue: string
  pathSuggestions: string[]
  pathAssistActive: boolean
  disabled?: boolean
  onPickCommand: (command: string) => void
  onPickPath: (path: string) => void
}

export function CommandAssist({
  commands,
  inputValue,
  pathSuggestions,
  pathAssistActive,
  disabled,
  onPickCommand,
  onPickPath,
}: CommandAssistProps) {
  const showPalette = inputValue.trim().startsWith('/')
  const suggestions = showPalette
    ? (() => {
        const token = inputValue.trim().split(/\s/)[0] ?? ''
        const lower = token.toLowerCase()
        return commands
          .filter((c) => c.name.toLowerCase().startsWith(lower))
          .slice(0, 10)
      })()
    : []

  return (
    <Stack spacing={1} sx={{ mb: 1 }}>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
          Commands
        </Typography>
        {QUICK_COMMANDS.map((cmd) => (
          <Chip
            key={cmd}
            label={cmd}
            size="small"
            variant="outlined"
            disabled={disabled}
            onClick={() => onPickCommand(cmd + ' ')}
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.7rem',
              borderColor: 'divider',
              '&:hover': { borderColor: 'primary.main', color: 'primary.light' },
            }}
          />
        ))}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
          type <Box component="code">/</Box> for all · <Box component="code">/add path</Box> Tab
          completes paths (desktop)
        </Typography>
      </Stack>

      {pathAssistActive && pathSuggestions.length > 0 && (
        <Paper
          data-testid="path-suggestions"
          variant="outlined"
          sx={{
            maxHeight: 180,
            overflow: 'auto',
            borderColor: 'info.dark',
            bgcolor: 'background.paper',
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, pt: 1 }}>
            Paths in project
          </Typography>
          <List dense disablePadding>
            {pathSuggestions.map((p) => (
              <ListItemButton
                key={p}
                disabled={disabled}
                onClick={() => onPickPath(p)}
                sx={{ py: 0.5 }}
              >
                <ListItemText
                  primary={p}
                  primaryTypographyProps={{
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                  }}
                />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}

      {showPalette && !pathAssistActive && suggestions.length > 0 && (
        <Paper
          variant="outlined"
          sx={{
            maxHeight: 220,
            overflow: 'auto',
            borderColor: 'primary.dark',
            bgcolor: 'background.paper',
          }}
        >
          <List dense disablePadding>
            {suggestions.map((cmd) => (
              <ListItemButton
                key={cmd.name}
                disabled={disabled}
                onClick={() => onPickCommand(cmd.name + ' ')}
                sx={{ py: 0.75 }}
              >
                <ListItemText
                  primary={cmd.name}
                  secondary={cmd.summary || undefined}
                  primaryTypographyProps={{
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    color: 'primary.light',
                  }}
                  secondaryTypographyProps={{ fontSize: '0.7rem' }}
                />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}
    </Stack>
  )
}
