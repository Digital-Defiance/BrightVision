import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import HubIcon from '@mui/icons-material/Hub'
import { Button, Chip, Stack, Tooltip, Typography } from '@mui/material'
import { projectDisplayName } from '../../ipc/openProject'

interface ProjectBarProps {
  projectPath: string
  onOpenProject: () => void
  disabled?: boolean
  /** Shown when `.cecli.workspaces.yml` defines multiple projects (e.g. "3 repos"). */
  workspaceBadge?: string | null
}

export function ProjectBar({
  projectPath,
  onOpenProject,
  disabled,
  workspaceBadge,
}: ProjectBarProps) {
  const label = projectDisplayName(projectPath)
  const tip = workspaceBadge ? `${projectPath}\nCecli workspace: ${workspaceBadge}` : projectPath
  return (
    <Tooltip title={tip} placement="bottom">
      <Button
        size="small"
        color="inherit"
        startIcon={<FolderOpenIcon fontSize="small" />}
        onClick={onOpenProject}
        disabled={disabled}
        data-testid="project-bar-open"
        sx={{
          textTransform: 'none',
          maxWidth: { xs: 160, sm: 280, md: 360 },
          minWidth: 0,
          justifyContent: 'flex-start',
          color: 'text.primary',
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          px: 1,
          py: 0.25,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
          <Typography variant="caption" noWrap component="span" sx={{ fontWeight: 600 }}>
            {label}
          </Typography>
          {workspaceBadge ? (
            <Chip
              size="small"
              icon={<HubIcon sx={{ fontSize: 14 }} />}
              label={workspaceBadge}
              data-testid="project-bar-workspace-badge"
              sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: '0.65rem' } }}
            />
          ) : null}
        </Stack>
      </Button>
    </Tooltip>
  )
}
