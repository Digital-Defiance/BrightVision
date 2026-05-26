import CloseIcon from '@mui/icons-material/Close'
import { Box, IconButton, Tab, Tabs, Typography } from '@mui/material'
import type { EditorTab } from '../../hooks/useEditorSession'

function tabLabel(path: string, dirty: boolean): string {
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path
  return dirty ? `${name} •` : name
}

interface EditorFileTabsProps {
  tabs: EditorTab[]
  activePath: string | null
  onSelect: (path: string) => void
  onClose: (path: string) => void
}

export function EditorFileTabs({ tabs, activePath, onSelect, onClose }: EditorFileTabsProps) {
  if (tabs.length === 0) {
    return (
      <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="body2" color="text.secondary">
          Open a file from the explorer →
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'stretch' }}>
      <Tabs
        value={activePath ?? false}
        onChange={(_, v) => onSelect(String(v))}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ flex: 1, minHeight: 40 }}
        data-testid="editor-file-tabs"
      >
        {tabs.map((tab) => (
          <Tab
            key={tab.path}
            value={tab.path}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, maxWidth: 180 }}>
                <Typography variant="body2" noWrap component="span">
                  {tabLabel(tab.path, tab.dirty)}
                </Typography>
                <IconButton
                  component="span"
                  size="small"
                  aria-label={`Close ${tab.path}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose(tab.path)
                  }}
                  sx={{ p: 0.25 }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            }
            sx={{ minHeight: 40, py: 0.5, textTransform: 'none' }}
          />
        ))}
      </Tabs>
    </Box>
  )
}
