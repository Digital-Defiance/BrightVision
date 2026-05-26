import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import SaveIcon from '@mui/icons-material/Save'
import {
  Box,
  Button,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useCallback, useEffect, useState } from 'react'
import { isTauriRuntime } from '../../ipc/isTauri'
import { useEditorSession } from '../../hooks/useEditorSession'
import { loadEditorPrefs, saveEditorPrefs, type EditorPrefs } from '../../theme/editorPrefs'
import { CodeEditor } from './CodeEditor'
import { EditorFileTabs } from './EditorFileTabs'
import { FileExplorer } from './FileExplorer'
import type { EditorGitBadge } from '../../utils/editorGitStatus'
import type { EditorLanguagePrefs } from '../../theme/editorLanguagePrefs'

interface EditorPanelProps {
  workingDir: string
  isRunning: boolean
  editorLanguagePrefs: EditorLanguagePrefs
  pendingOpenPath?: string | null
  onPendingOpenConsumed?: () => void
  gitStatusByPath?: Map<string, EditorGitBadge>
  onAddToContext?: (paths: string[]) => void
  onNotify?: (message: string, severity: 'info' | 'warning' | 'error') => void
}

export function EditorPanel({
  workingDir,
  isRunning,
  editorLanguagePrefs,
  pendingOpenPath,
  onPendingOpenConsumed,
  gitStatusByPath,
  onAddToContext,
  onNotify,
}: EditorPanelProps) {
  const [prefs, setPrefs] = useState<EditorPrefs>(() => loadEditorPrefs())
  const editor = useEditorSession(workingDir)

  useEffect(() => {
    saveEditorPrefs(prefs)
  }, [prefs])

  const desktop = isTauriRuntime()

  useEffect(() => {
    if (!pendingOpenPath || !desktop) return
    void editor.openFile(pendingOpenPath)
    onPendingOpenConsumed?.()
    // Open once per pending path from App (avoid re-run when tab state updates).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpenPath, desktop])

  const handleCloseTab = useCallback(
    (path: string) => {
      const tab = editor.tabs.find((t) => t.path === path)
      if (tab?.dirty) {
        const name = path.split('/').pop() ?? path
        if (!window.confirm(`Discard unsaved changes in ${name}?`)) return
      }
      editor.closeTab(path)
    },
    [editor]
  )

  const handleSave = useCallback(async () => {
    const ok = await editor.saveActive()
    if (ok) onNotify?.('Saved', 'info')
    else if (editor.activeTab?.error) onNotify?.(editor.activeTab.error, 'error')
  }, [editor, onNotify])

  const handleAddToContext = useCallback(() => {
    if (!editor.activePath || !onAddToContext) return
    if (!isRunning) {
      onNotify?.('Start the session from Terminal before adding files to context', 'warning')
      return
    }
    onAddToContext([editor.activePath])
  }, [editor.activePath, isRunning, onAddToContext, onNotify])

  return (
    <Box
      className="vision-editor"
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}
      data-testid="editor-panel"
    >
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ px: 1, py: 0.75, borderBottom: 1, borderColor: 'divider' }}
      >
        <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
          Editor
        </Typography>
        <Tooltip title={prefs.explorerOpen ? 'Hide explorer' : 'Show explorer'}>
          <Button
            size="small"
            variant="outlined"
            onClick={() => setPrefs((p) => ({ ...p, explorerOpen: !p.explorerOpen }))}
            data-testid="editor-toggle-explorer"
            startIcon={prefs.explorerOpen ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          >
            Explorer
          </Button>
        </Tooltip>
        <Button
          size="small"
          variant="contained"
          disabled={!editor.activeTab || editor.activeTab.loading || !desktop}
          startIcon={<SaveIcon />}
          onClick={() => void handleSave()}
          data-testid="editor-save"
        >
          Save
        </Button>
        {onAddToContext && (
          <Button
            size="small"
            variant="outlined"
            disabled={!editor.activePath || !isRunning}
            onClick={handleAddToContext}
            data-testid="editor-add-to-context"
          >
            Add to context
          </Button>
        )}
      </Stack>

      <EditorFileTabs
        tabs={editor.tabs}
        activePath={editor.activePath}
        onSelect={editor.setActivePath}
        onClose={handleCloseTab}
      />

      <Box sx={{ flex: 1, minHeight: 0 }}>
        {!desktop ? (
          <Paper variant="outlined" sx={{ m: 2, p: 2 }}>
            <Typography variant="body2" color="text.secondary">
              The editor reads and writes files through the desktop app. Use{' '}
              <strong>yarn tauri dev</strong> to browse, open, and save project files here.
            </Typography>
          </Paper>
        ) : (
          <Group orientation="horizontal" style={{ height: '100%' }}>
            <Panel defaultSize={prefs.explorerOpen ? 100 - prefs.explorerSizePct : 100} minSize={35}>
              <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {editor.activeTab?.loading ? (
                  <Typography sx={{ p: 2 }} color="text.secondary">
                    Loading…
                  </Typography>
                ) : editor.activeTab?.error ? (
                  <Typography sx={{ p: 2 }} color="error.main">
                    {editor.activeTab.error}
                  </Typography>
                ) : editor.activeTab ? (
                  <CodeEditor
                    path={editor.activeTab.path}
                    value={editor.activeTab.content}
                    onChange={(v) => editor.setTabContent(editor.activeTab!.path, v)}
                    onSave={() => void handleSave()}
                    enabledOptionalPluginIds={editorLanguagePrefs.enabledOptionalPluginIds}
                  />
                ) : (
                  <Box
                    sx={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      p: 3,
                    }}
                  >
                    <Typography variant="body2" color="text.secondary" align="center">
                      Select a file in the explorer, or turn the explorer on with the button above.
                    </Typography>
                  </Box>
                )}
              </Box>
            </Panel>
            {prefs.explorerOpen && (
              <>
                <Separator
                  style={{
                    width: 4,
                    background: 'var(--mui-palette-divider, #2d3a4f)',
                    cursor: 'col-resize',
                  }}
                />
                <Panel defaultSize={prefs.explorerSizePct} minSize={15} maxSize={50}>
                  <FileExplorer
                    workingDir={workingDir}
                    activePath={editor.activePath}
                    onOpenFile={(path) => void editor.openFile(path)}
                    gitStatusByPath={gitStatusByPath}
                  />
                </Panel>
              </>
            )}
          </Group>
        )}
      </Box>
    </Box>
  )
}
