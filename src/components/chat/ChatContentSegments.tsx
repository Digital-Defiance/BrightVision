import { Box } from '@mui/material'
import type { AssistantContentSegment } from '../../utils/proposedEdits'
import { ChatFenceBlock } from './ChatFenceBlock'
import { CollapsibleJsonBlock } from './CollapsibleJsonBlock'
import { ChatMarkdown } from './ChatMarkdown'

interface ChatContentSegmentsProps {
  segments: AssistantContentSegment[]
  proseClassName?: string
  appliedFiles?: string[]
}

export function ChatContentSegments({
  segments,
  proseClassName,
}: ChatContentSegmentsProps) {
  return (
    <>
      {segments.map((seg, i) => {
        const key = String(i)
        if (seg.type === 'prose') {
          const text = seg.content.trim()
          if (!text) return null
          return (
            <Box
              key={key}
              className={proseClassName}
              sx={
                proseClassName
                  ? { '& .vision-chat-markdown': { color: 'primary.contrastText' } }
                  : undefined
              }
            >
              <ChatMarkdown content={seg.content} />
            </Box>
          )
        }
        if (seg.type === 'json_block') {
          return <CollapsibleJsonBlock key={key} value={seg.value} text={seg.raw} />
        }
        if (seg.type === 'display_fence') {
          return (
            <ChatFenceBlock
              key={key}
              language={seg.language}
              body={seg.body}
              complete={seg.complete}
            />
          )
        }
        return null
      })}
    </>
  )
}
