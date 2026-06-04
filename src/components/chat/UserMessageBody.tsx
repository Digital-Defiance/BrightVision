import { Stack } from '@mui/material'
import { parseAssistantContent } from '../../utils/proposedEdits'
import { ChatContentSegments } from './ChatContentSegments'

interface UserMessageBodyProps {
  content: string
}

/** User turns: fences, json blocks, and prose (with preserved newlines). */
export function UserMessageBody({ content }: UserMessageBodyProps) {
  const segments = parseAssistantContent(content)
  return (
    <Stack spacing={1} sx={{ pr: 3 }}>
      <ChatContentSegments segments={segments} proseClassName="vision-chat-markdown-user" />
    </Stack>
  )
}
