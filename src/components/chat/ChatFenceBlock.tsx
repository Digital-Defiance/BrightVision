import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { Box, Chip, IconButton, Paper, Tooltip, Typography } from '@mui/material'
import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import CodeMirror from '@uiw/react-codemirror'
import { useMemo, useState } from 'react'
import {
  fenceLanguageExtensions,
  fenceLanguageLabel,
  isMermaidFence,
  normalizeFenceLanguage,
} from '../../utils/fenceLanguage'
import { MermaidFence } from './MermaidFence'
import { CollapsibleJsonBlock } from './CollapsibleJsonBlock'
import { parseAgentJsonText } from '../../utils/jsonParse'

/**
 * Strip cecli hashline prefixes (`abcd::`) from code content for display.
 * These are 4-char hex/alnum IDs used by cecli's ReadRange/EditText tools
 * to let the model reference specific lines. Not useful for the user.
 */
function stripHashlinePrefixes(text: string): string {
  // Pattern: line starts with exactly 4 alphanumeric chars + `::`
  // Only strip if most lines match (avoid false positives on normal code)
  const lines = text.split('\n')
  const hashlinePattern = /^[a-zA-Z0-9~]{4}::/
  const matchCount = lines.filter((l) => hashlinePattern.test(l)).length
  // Strip if at least 60% of non-empty lines match the pattern
  const nonEmpty = lines.filter((l) => l.trim()).length
  if (nonEmpty > 0 && matchCount / nonEmpty >= 0.6) {
    return lines.map((l) => (hashlinePattern.test(l) ? l.slice(6) : l)).join('\n')
  }
  return text
}

/** Strip `<file path="...">` / `</file>` wrapper tags from code content. */
function stripFileWrapperTags(text: string): { body: string; filePath: string | null } {
  const lines = text.split('\n')
  let filePath: string | null = null
  let startIdx = 0
  let endIdx = lines.length

  // Check first non-empty line for <file path="...">
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue
    const m = trimmed.match(/^<file\s+path="([^"]+)"[^>]*>$/)
    if (m) {
      filePath = m[1]
      startIdx = i + 1
    }
    break
  }

  // Check last non-empty line for </file>
  for (let i = lines.length - 1; i >= startIdx; i--) {
    const trimmed = lines[i].trim()
    if (!trimmed) continue
    if (trimmed === '</file>') {
      endIdx = i
    }
    break
  }

  if (filePath) {
    return { body: lines.slice(startIdx, endIdx).join('\n'), filePath }
  }
  return { body: text, filePath: null }
}

interface ChatFenceBlockProps {
  language: string
  body: string
  complete: boolean
}

export function ChatFenceBlock({ language, body, complete }: ChatFenceBlockProps) {
  const [copied, setCopied] = useState(false)
  const { body: unwrappedBody, filePath } = useMemo(() => stripFileWrapperTags(body), [body])
  const displayBody = useMemo(() => stripHashlinePrefixes(unwrappedBody), [unwrappedBody])
  const label = filePath || fenceLanguageLabel(language)
  const langId = normalizeFenceLanguage(language)
  const mermaid = isMermaidFence(language)
  const jsonValue = useMemo(
    () => (!mermaid ? parseAgentJsonText(displayBody) : null),
    [displayBody, mermaid]
  )

  const extensions = useMemo(
    () => (mermaid ? [] : fenceLanguageExtensions(language)),
    [language, mermaid]
  )

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <Paper
      variant="outlined"
      className="vision-chat-fence"
      data-testid="chat-fence-block"
      data-fence-lang={langId}
      sx={{
        borderColor: 'divider',
        bgcolor: 'background.default',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1,
          py: 0.5,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'action.hover',
        }}
      >
        <Chip label={label} size="small" sx={{ height: 22, fontSize: '0.65rem' }} />
        {!complete && (
          <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            streaming…
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title={copied ? 'Copied' : 'Copy'}>
          <IconButton size="small" aria-label="Copy code" onClick={() => void handleCopy()}>
            <ContentCopyIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ p: jsonValue ? 1 : mermaid ? 1.5 : 0, minHeight: mermaid ? 48 : 0 }}>
        {jsonValue ? (
          <CollapsibleJsonBlock value={jsonValue} text={displayBody.trim()} />
        ) : mermaid ? (
          <MermaidFence source={displayBody} complete={complete} />
        ) : extensions.length > 0 ? (
          <Box
            sx={{
              maxHeight: 360,
              overflow: 'auto',
              '& .cm-editor': { fontSize: '0.8rem' },
              '& .cm-scroller': { fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, monospace' },
            }}
          >
            <CodeMirror
              value={displayBody}
              theme={vscodeDark}
              extensions={extensions}
              editable={false}
              basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: false }}
            />
          </Box>
        ) : (
          <Typography
            component="pre"
            variant="body2"
            sx={{
              m: 0,
              p: 1.25,
              overflow: 'auto',
              maxHeight: 360,
              fontSize: '0.8rem',
              whiteSpace: 'pre-wrap',
              fontFamily: 'ui-monospace, Menlo, Monaco, Consolas, monospace',
            }}
          >
            {displayBody}
          </Typography>
        )}
      </Box>
    </Paper>
  )
}
