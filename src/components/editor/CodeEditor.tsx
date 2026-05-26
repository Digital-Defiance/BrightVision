import { Box } from '@mui/material'
import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import CodeMirror from '@uiw/react-codemirror'
import { useMemo } from 'react'
import { keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { useEditorLanguageExtensions } from '../../hooks/useEditorLanguageExtensions'
import type { OptionalEditorLanguagePluginId } from '../../editor/languageRegistry'

interface CodeEditorProps {
  path: string
  value: string
  onChange: (value: string) => void
  onSave?: () => void
  readOnly?: boolean
  enabledOptionalPluginIds?: readonly OptionalEditorLanguagePluginId[]
}

export function CodeEditor({
  path,
  value,
  onChange,
  onSave,
  readOnly = false,
  enabledOptionalPluginIds = [],
}: CodeEditorProps) {
  const { languageExtensions } = useEditorLanguageExtensions(path, enabledOptionalPluginIds)

  const extensions = useMemo(() => {
    const saveKeymap = onSave
      ? keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              onSave()
              return true
            },
          },
        ])
      : []
    return [
      history(),
      ...languageExtensions,
      saveKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap]),
    ]
  }, [languageExtensions, onSave])

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        '& .cm-editor': { height: '100%' },
        '& .cm-scroller': { fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, monospace' },
      }}
      data-testid="code-editor"
    >
      <CodeMirror
        value={value}
        height="100%"
        theme={vscodeDark}
        extensions={extensions}
        editable={!readOnly}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
        }}
      />
    </Box>
  )
}
