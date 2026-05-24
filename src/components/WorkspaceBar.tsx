import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import { IconButton, Stack, TextField, Tooltip } from '@mui/material'
import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime } from '../ipc/isTauri'

interface WorkspaceBarProps {
  workingDir: string
  onChange: (path: string) => void
  disabled?: boolean
}

export function WorkspaceBar({ workingDir, onChange, disabled }: WorkspaceBarProps) {
  const pickFolder = async () => {
    if (!isTauriRuntime()) return
    try {
      const selected = await invoke<string | null>('pick_workspace_folder')
      if (selected) onChange(selected)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TextField
        fullWidth
        size="small"
        value={workingDir}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="/path/to/git-superproject"
        slotProps={{
          htmlInput: {
            style: { fontFamily: 'monospace', fontSize: '0.875rem' },
          },
        }}
        helperText="Repository the agent edits — can be any project, not necessarily this app’s clone"
      />
      {isTauriRuntime() && (
        <Tooltip title="Choose folder">
          <span>
            <IconButton onClick={pickFolder} disabled={disabled} edge="end">
              <FolderOpenIcon />
            </IconButton>
          </span>
        </Tooltip>
      )}
    </Stack>
  )
}
