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
  disabled?: boolean
  onPickCommand: (command: string) => void
}

export function CommandAssist({
  commands,
  inputValue,
  disabled,
  onPickCommand,
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
          type <Box component="code">/</Box> for all · <Box component="code">/drop</Box> removes files from
          chat · shell <Box component="code">!cmd</Box>
        </Typography>
      </Stack>

      {showPalette && suggestions.length > 0 && (
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
