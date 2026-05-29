import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import SettingsIcon from '@mui/icons-material/Settings'
import {
  Box,
  Button,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { DISPLAY_CORE, DISPLAY_VISION } from '../../brand'

interface WelcomePanelProps {
  projectPath: string
  enginePath?: string
  onChooseProject: () => void
  onOpenSettings: () => void
  onOpenSpec: () => void
  onStart: () => void
  onDismiss?: () => void
}

export function WelcomePanel({
  projectPath,
  enginePath,
  onChooseProject,
  onOpenSettings,
  onOpenSpec,
  onStart,
  onDismiss,
}: WelcomePanelProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 3,
        mb: 2,
        borderColor: 'divider',
        background:
          'linear-gradient(145deg, rgba(139, 92, 246, 0.08) 0%, rgba(34, 211, 238, 0.04) 100%)',
      }}
    >
      <Typography variant="h6" fontWeight={700} gutterBottom>
        Welcome to {DISPLAY_VISION}
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Point Vision at a <strong>git project</strong> to edit. The {DISPLAY_CORE} engine ships with
        this app — you do not copy it into every repo.
      </Typography>

      <Stack spacing={1.5} sx={{ mb: 2 }}>
        {[
          { n: 1, text: 'Choose the repo you want to work on (or keep the auto-detected path).' },
          { n: 2, text: 'Optionally set model and API keys in Settings, then Save.' },
          { n: 3, text: 'Click Start agent below (or on the chat tab) — launches local LLM, Vision API, and session.' },
        ].map((step) => (
          <Stack key={step.n} direction="row" spacing={1.5} alignItems="flex-start">
            <Box
              sx={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                fontSize: '0.75rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {step.n}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {step.text}
            </Typography>
          </Stack>
        ))}
      </Stack>

      <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
        Project
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontFamily: 'monospace', fontSize: '0.8rem', mb: enginePath ? 1.5 : 2, wordBreak: 'break-all' }}
      >
        {projectPath}
      </Typography>
      {enginePath && (
        <>
          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
            Engine (bundled)
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'text.secondary', mb: 2, wordBreak: 'break-all' }}
          >
            {enginePath}
          </Typography>
        </>
      )}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button variant="contained" startIcon={<FolderOpenIcon />} onClick={onChooseProject}>
          Choose project
        </Button>
        <Button variant="outlined" startIcon={<SettingsIcon />} onClick={onOpenSettings}>
          Settings
        </Button>
        <Button variant="outlined" onClick={onOpenSpec}>
          Spec tab
        </Button>
        <Button variant="contained" color="success" startIcon={<PlayArrowIcon />} onClick={onStart}>
          Start agent
        </Button>
        {onDismiss && (
          <Button size="small" onClick={onDismiss} sx={{ ml: 'auto' }}>
            Hide
          </Button>
        )}
      </Stack>
    </Paper>
  )
}
