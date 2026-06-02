import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import {
  Box,
  Button,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { DISPLAY_VISION } from '../../brand'
import { projectDisplayName } from '../../ipc/openProject'
import { isTauriRuntime } from '../../ipc/isTauri'

interface OpenProjectScreenProps {
  selectedPath: string
  onSelectedPathChange: (path: string) => void
  recents: string[]
  suggestedPath: string | null
  opening: boolean
  onPickFolder: () => void
  onOpen: (path: string) => void
}

export function OpenProjectScreen({
  selectedPath,
  onSelectedPathChange,
  recents,
  suggestedPath,
  opening,
  onPickFolder,
  onOpen,
}: OpenProjectScreenProps) {
  const canOpen = selectedPath.trim().length > 0 && selectedPath.trim() !== '.'
  const openLabel = canOpen
    ? `Open ${projectDisplayName(selectedPath)}`
    : 'Open project'

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 3,
      }}
      data-testid="open-project-screen"
    >
      <Paper
        variant="outlined"
        sx={{
          maxWidth: 560,
          width: '100%',
          p: 4,
          borderColor: 'divider',
          background:
            'linear-gradient(145deg, rgba(139, 92, 246, 0.08) 0%, rgba(34, 211, 238, 0.04) 100%)',
        }}
      >
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Open a project
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          {DISPLAY_VISION} works inside one <strong>git repository</strong> at a time — like other
          IDEs, choose the folder you are editing before you chat, run tasks, or use git.
        </Typography>

        {isTauriRuntime() ? (
          <TextField
            fullWidth
            size="small"
            label="Project folder"
            value={selectedPath}
            onChange={(e) => onSelectedPathChange(e.target.value)}
            slotProps={{
              input: { sx: { fontFamily: 'monospace', fontSize: '0.85rem' } },
            }}
            helperText={
              suggestedPath && suggestedPath !== selectedPath
                ? `Suggested: ${suggestedPath}`
                : 'Absolute path to your git repo'
            }
            sx={{ mb: 2 }}
          />
        ) : (
          <TextField
            fullWidth
            size="small"
            label="Project path"
            value={selectedPath}
            onChange={(e) => onSelectedPathChange(e.target.value)}
            slotProps={{
              input: { sx: { fontFamily: 'monospace', fontSize: '0.85rem' } },
            }}
            helperText="Path to your git repo (web dev)"
            sx={{ mb: 2 }}
          />
        )}

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          {isTauriRuntime() && (
            <Button
              variant="outlined"
              startIcon={<FolderOpenIcon />}
              onClick={() => void onPickFolder()}
              disabled={opening}
            >
              Choose folder…
            </Button>
          )}
          <Button
            variant="contained"
            onClick={() => void onOpen(selectedPath)}
            disabled={!canOpen || opening}
            data-testid="open-project-confirm"
          >
            {opening ? 'Opening…' : openLabel}
          </Button>
        </Stack>

        {recents.length > 0 && (
          <>
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              Recent projects
            </Typography>
            <List dense disablePadding sx={{ mb: 1 }}>
              {recents.map((path) => (
                <ListItemButton
                  key={path}
                  selected={path === selectedPath}
                  onClick={() => onSelectedPathChange(path)}
                  data-testid="open-project-recent"
                >
                  <ListItemText
                    primary={projectDisplayName(path)}
                    secondary={path}
                    secondaryTypographyProps={{
                      sx: { fontFamily: 'monospace', fontSize: '0.7rem' },
                    }}
                  />
                </ListItemButton>
              ))}
            </List>
          </>
        )}

        {suggestedPath && !recents.includes(suggestedPath) && (
          <Button
            size="small"
            onClick={() => onSelectedPathChange(suggestedPath)}
            sx={{ mt: 1 }}
          >
            Use suggested: {projectDisplayName(suggestedPath)}
          </Button>
        )}
      </Paper>
    </Box>
  )
}
