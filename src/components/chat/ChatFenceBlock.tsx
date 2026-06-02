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

interface ChatFenceBlockProps {
  language: string
  body: string
  complete: boolean
}

export function ChatFenceBlock({ language, body, complete }: ChatFenceBlockProps) {
  const [copied, setCopied] = useState(false)
  const label = fenceLanguageLabel(language)
  const langId = normalizeFenceLanguage(language)
  const mermaid = isMermaidFence(language)
  const jsonValue = useMemo(
    () => (!mermaid ? parseAgentJsonText(body) : null),
    [body, mermaid]
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
          <CollapsibleJsonBlock value={jsonValue} text={body.trim()} />
        ) : mermaid ? (
          <MermaidFence source={body} complete={complete} />
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
              value={body}
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
            {body}
          </Typography>
        )}
      </Box>
    </Paper>
  )
}
