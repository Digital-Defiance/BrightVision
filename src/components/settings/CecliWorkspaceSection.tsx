import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import RefreshIcon from '@mui/icons-material/Refresh'
import SaveIcon from '@mui/icons-material/Save'
import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import type { CecliWorkspaceInfo } from '../../ipc/httpClient'
import { isTauriRuntime } from '../../ipc/isTauri'
import { readWorkspaceTextFile, writeWorkspaceTextFile } from '../../ipc/workspaceEditor'

const WORKSPACE_REL = '.cecli.workspaces.yml'

interface CecliWorkspaceSectionProps {
  workingDir: string
  info: CecliWorkspaceInfo
  loading: boolean
  error: string | null
  onRefresh: () => void | Promise<void>
  onOpenInEditor?: (relativePath: string) => void
  onMessage?: (message: string, severity: 'info' | 'warning' | 'error') => void
}

export function CecliWorkspaceSection({
  workingDir,
  info,
  loading,
  error,
  onRefresh,
  onOpenInEditor,
  onMessage,
}: CecliWorkspaceSectionProps) {
  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (info.present && info.raw != null) {
      setDraft(info.raw)
      setDirty(false)
    } else if (!info.present) {
      setDraft(
        [
          'name: my-workspace',
          'projects:',
          '  - name: app',
          `    path: ${workingDir || '/abs/path/to/primary'}`,
          '    primary: true',
          '  - name: lib',
          '    path: /abs/path/to/other-repo',
          '',
        ].join('\n')
      )
      setDirty(false)
    }
  }, [info.present, info.raw, workingDir])

  const loadFromDisk = useCallback(async () => {
    if (!isTauriRuntime() || !workingDir.trim()) return
    try {
      const text = await readWorkspaceTextFile(workingDir, WORKSPACE_REL)
      setDraft(text)
      setDirty(false)
    } catch {
      /* file may not exist yet */
    }
  }, [workingDir])

  useEffect(() => {
    if (isTauriRuntime() && info.present) void loadFromDisk()
  }, [info.present, loadFromDisk])

  const handleSave = async () => {
    if (!isTauriRuntime()) {
      onMessage?.('Save requires the desktop app', 'warning')
      return
    }
    if (!workingDir.trim()) return
    setSaving(true)
    try {
      await writeWorkspaceTextFile(workingDir, WORKSPACE_REL, draft)
      setDirty(false)
      onMessage?.('Saved .cecli.workspaces.yml — Stop & Start the session to apply.', 'info')
      await onRefresh()
    } catch (e) {
      onMessage?.(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="cecli-workspace-section">
      <Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
          <Typography variant="subtitle1" fontWeight={600}>
            Multi-repo workspace
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() => void onRefresh()}
              disabled={loading}
            >
              Refresh
            </Button>
            {info.present && onOpenInEditor && (
              <Button
                size="small"
                startIcon={<OpenInNewIcon />}
                onClick={() => onOpenInEditor(WORKSPACE_REL)}
              >
                Open in editor
              </Button>
            )}
          </Stack>
        </Stack>

        <Typography variant="body2" color="text.secondary">
          Optional <code>.cecli.workspaces.yml</code> at the project root unions multiple git repos
          for <code>/add</code>, repomap, and commits (cecli workspace mode). Example:{' '}
          <Link href="https://github.com/Digital-Defiance/BrightVision/blob/main/docs/.cecli.workspaces.example.yml">
            docs/.cecli.workspaces.example.yml
          </Link>
          . Without this file, nested <strong>submodules</strong> still work via the superproject.
        </Typography>

        {error && (
          <Alert severity="warning" variant="outlined">
            {error}
          </Alert>
        )}

        {info.parse_error && (
          <Alert severity="error" variant="outlined">
            YAML parse/validate: {info.parse_error}
          </Alert>
        )}

        {info.present ? (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={info.filename ?? WORKSPACE_REL} color="primary" variant="outlined" />
            {info.name && <Chip size="small" label={info.name} variant="outlined" />}
            <Chip
              size="small"
              label={`${info.project_count} project${info.project_count === 1 ? '' : 's'}`}
              variant="outlined"
            />
            {info.projects.map((p) => (
              <Chip
                key={p.name ?? p.path ?? p.repo ?? '?'}
                size="small"
                label={p.name ?? 'unnamed'}
                color={p.primary ? 'primary' : 'default'}
                variant={p.primary ? 'filled' : 'outlined'}
              />
            ))}
          </Stack>
        ) : (
          <Alert severity="info" variant="outlined">
            No workspace file in this project. Edit below and save to create one (desktop), or copy
            the example into your repo root.
          </Alert>
        )}

        <TextField
          label={WORKSPACE_REL}
          fullWidth
          multiline
          minRows={8}
          maxRows={20}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setDirty(true)
          }}
          disabled={!isTauriRuntime() && !info.present}
          slotProps={{
            input: {
              sx: { fontFamily: 'monospace', fontSize: '0.8rem' },
            },
          }}
          helperText={
            isTauriRuntime()
              ? 'Save writes the file under the open project. Restart the agent session after changes.'
              : 'Editing requires the desktop app; web can view when the Vision API is running.'
          }
        />

        {isTauriRuntime() && (
          <Box>
            <Button
              variant="contained"
              size="small"
              startIcon={<SaveIcon />}
              onClick={() => void handleSave()}
              disabled={saving || !dirty}
            >
              Save workspace file
            </Button>
          </Box>
        )}
      </Stack>
    </Paper>
  )
}
