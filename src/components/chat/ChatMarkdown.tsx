import { Box, Link, Typography } from '@mui/material'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChatFenceBlock } from './ChatFenceBlock'

const markdownComponents: Components = {
  p: ({ children }) => (
    <Typography variant="body2" component="p" sx={{ mb: 1, '&:last-child': { mb: 0 } }}>
      {children}
    </Typography>
  ),
  strong: ({ children }) => (
    <Box component="strong" sx={{ fontWeight: 600, color: 'text.primary' }}>
      {children}
    </Box>
  ),
  em: ({ children }) => (
    <Box component="em" sx={{ fontStyle: 'italic' }}>
      {children}
    </Box>
  ),
  ul: ({ children }) => (
    <Box component="ul" sx={{ m: 0, mb: 1, pl: 2.5 }}>
      {children}
    </Box>
  ),
  ol: ({ children }) => (
    <Box component="ol" sx={{ m: 0, mb: 1, pl: 2.5 }}>
      {children}
    </Box>
  ),
  li: ({ children }) => (
    <Typography variant="body2" component="li" sx={{ mb: 0.35 }}>
      {children}
    </Typography>
  ),
  h1: ({ children }) => (
    <Typography variant="subtitle1" component="h1" sx={{ fontWeight: 600, mt: 1, mb: 0.5 }}>
      {children}
    </Typography>
  ),
  h2: ({ children }) => (
    <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 600, mt: 1, mb: 0.5 }}>
      {children}
    </Typography>
  ),
  h3: ({ children }) => (
    <Typography variant="body2" component="h3" sx={{ fontWeight: 600, mt: 0.75, mb: 0.35 }}>
      {children}
    </Typography>
  ),
  a: ({ href, children }) => (
    <Link href={href} target="_blank" rel="noopener noreferrer" variant="body2">
      {children}
    </Link>
  ),
  /** Fenced blocks: CM6 / Mermaid (same as top-level ``` split in parseAssistantContent). */
  pre: ({ children }) => <Box sx={{ my: 1 }}>{children}</Box>,
  code: ({ className, children }) => {
    const text = String(children ?? '').replace(/\n$/, '')
    if (!className) {
      return (
        <Box
          component="code"
          sx={{
            fontFamily: 'var(--vision-font-terminal, monospace)',
            fontSize: '0.85em',
            bgcolor: 'action.hover',
            px: 0.5,
            py: 0.25,
            borderRadius: 0.5,
          }}
        >
          {text}
        </Box>
      )
    }
    const lang = /language-([\w-]+)/.exec(className)?.[1] ?? ''
    return <ChatFenceBlock language={lang} body={text} complete />
  },
}

interface ChatMarkdownProps {
  content: string
}

/**
 * Render assistant prose as GitHub-flavored markdown.
 *
 * Top-level ``` fences are usually split earlier by ``parseAssistantContent`` for
 * proposed edits; any fences left inside prose (or standard code examples) render here.
 */
export function ChatMarkdown({ content }: ChatMarkdownProps) {
  const trimmed = content.trim()
  if (!trimmed) return null
  return (
    <Box className="vision-chat-markdown" data-testid="chat-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </Box>
  )
}
