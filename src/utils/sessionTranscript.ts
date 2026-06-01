import type { ChatMessage } from '../components/chat/ChatPanel'

export interface TranscriptRow {
  role: 'user' | 'assistant'
  content: string
}

export function isSessionLoadedToolOutput(text: string): boolean {
  return /Session loaded:/i.test(text) || /Loaded \d+ messages/i.test(text)
}

/** Map core transcript rows into chat bubbles (caps applied by caller). */
export function transcriptToChatMessages(
  rows: TranscriptRow[],
  nextId: () => number
): ChatMessage[] {
  const out: ChatMessage[] = []
  for (const row of rows) {
    if (row.role !== 'user' && row.role !== 'assistant') continue
    const content = row.content.trim()
    if (!content) continue
    out.push({ id: nextId(), role: row.role, content })
  }
  return out
}
