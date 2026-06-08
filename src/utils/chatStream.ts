import { parseTokenUsageReport } from './contextUsage'

/** Parse token usage line from core tool_output (base_coder.show_usage_report). */
export function parseTokenUsage(text: string): string | null {
  return parseTokenUsageReport(text)?.raw ?? null
}

export type AssistantSectionKind = 'thinking' | 'answer' | 'reasoning' | 'body'

export interface AssistantSection {
  kind: AssistantSectionKind
  content: string
}

interface SectionMarker {
  kind: AssistantSectionKind
  pattern: RegExp
}

/** Ordered by typical appearance; all matches are found and sorted by index. */
const SECTION_MARKERS: SectionMarker[] = [
  { kind: 'thinking', pattern: /<think>/gi },
  { kind: 'answer', pattern: /<\/think>/gi },
  { kind: 'thinking', pattern: /►\s*\*\*THINKING\*\*/gi },
  { kind: 'answer', pattern: /►\s*\*\*ANSWER\*\*/gi },
  { kind: 'reasoning', pattern: /►\s*\*\*REASONING\*\*/gi },
  { kind: 'thinking', pattern: /\*\*THINKING\*\*/gi },
  { kind: 'answer', pattern: /\*\*ANSWER\*\*/gi },
  { kind: 'reasoning', pattern: /\*\*REASONING\*\*/gi },
]

function stripMarkerLine(text: string): string {
  let out = text
  for (const { pattern } of SECTION_MARKERS) {
    out = out.replace(pattern, '')
  }
  return out.trim()
}

interface MarkerHit {
  index: number
  length: number
  kind: AssistantSectionKind
}

function findMarkerHits(content: string): MarkerHit[] {
  const hits: MarkerHit[] = []
  for (const marker of SECTION_MARKERS) {
    const re = new RegExp(marker.pattern.source, marker.pattern.flags)
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      hits.push({ index: m.index, length: m[0].length, kind: marker.kind })
    }
  }
  hits.sort((a, b) => a.index - b.index)
  const deduped: MarkerHit[] = []
  for (const hit of hits) {
    const prev = deduped[deduped.length - 1]
    if (prev && hit.index < prev.index + prev.length) continue
    deduped.push(hit)
  }
  return deduped
}

/** Section currently being streamed (last marker in content), or `body` if none. */
export function getActiveAssistantSection(content: string): AssistantSectionKind {
  const hits = findMarkerHits(content)
  return hits.length > 0 ? hits[hits.length - 1].kind : 'body'
}

/** Split assistant text into labeled sections when markers are present. */
export function splitAssistantSections(content: string): AssistantSection[] {
  const hits = findMarkerHits(content)
  if (hits.length === 0) {
    const trimmed = content.trim()
    return trimmed ? [{ kind: 'body', content: trimmed }] : []
  }

  const sections: AssistantSection[] = []
  let pos = 0

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]
    const sectionStart = hit.index + hit.length
    const sectionEnd = i + 1 < hits.length ? hits[i + 1].index : content.length

    if (hit.index > pos) {
      const preamble = content.slice(pos, hit.index).trim()
      if (preamble) sections.push({ kind: 'body', content: preamble })
    }

    const body = stripMarkerLine(content.slice(sectionStart, sectionEnd))
    if (body) sections.push({ kind: hit.kind, content: body })
    pos = sectionEnd
  }

  if (pos < content.length) {
    const tail = content.slice(pos).trim()
    if (tail) sections.push({ kind: 'body', content: tail })
  }

  return sections.length > 0 ? sections : [{ kind: 'body', content: content.trim() }]
}

export const MAX_CHAT_MESSAGES = 200
export const MAX_TOOL_EVENTS = 100
export const MAX_TERMINAL_LINES = 500

export function capList<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  return items.slice(items.length - max)
}

/** Longest suffix of `a` that matches a prefix of `b`. */
export function suffixPrefixOverlap(a: string, b: string): number {
  const max = Math.min(a.length, b.length)
  for (let len = max; len > 0; len--) {
    if (a.endsWith(b.slice(0, len))) return len
  }
  return 0
}

/**
 * Append one streamed token chunk without duplicating text when the provider
 * resends cumulative snapshots or overlapping segments.
 */
export function appendStreamingToken(existing: string, chunk: string): string {
  if (!chunk) return existing
  if (!existing) return chunk
  if (chunk === existing) return existing
  if (chunk.startsWith(existing)) return chunk
  if (existing.endsWith(chunk)) return existing
  const overlap = suffixPrefixOverlap(existing, chunk)
  if (overlap > 0) return existing + chunk.slice(overlap)
  return existing + chunk
}

/**
 * Content for a new assistant bubble after a tool break within the same turn.
 * When the provider resends a cumulative snapshot, only the suffix not already
 * shown in prior bubbles is returned.
 */
export function initialAssistantBubbleChunk(priorStream: string, chunk: string): string {
  if (!chunk) return ''
  if (!priorStream) return chunk
  const merged = appendStreamingToken(priorStream, chunk)
  if (merged.length <= priorStream.length) return ''
  return merged.slice(priorStream.length)
}

export interface ModelRouteCarrier {
  modelRoute?: unknown
}

/** Carry the last explicit model route forward until the next user message. */
export function withInheritedModelRoutes<T extends ModelRouteCarrier & { role: string }>(
  messages: readonly T[]
): T[] {
  let route: T['modelRoute'] | undefined
  return messages.map((m) => {
    if (m.role === 'user') {
      route = undefined
      return m
    }
    if (m.role === 'assistant') {
      if (m.modelRoute) {
        route = m.modelRoute
        return m
      }
      if (route) return { ...m, modelRoute: route }
    }
    return m
  })
}

export type TimelineSortable = { id: number }

/** Merge chat messages and tool events in SSE arrival order (by monotonic id). */
export function mergeChatTimeline<T extends TimelineSortable, U extends TimelineSortable>(
  messages: readonly T[],
  tools: readonly U[]
): Array<{ kind: 'message'; item: T } | { kind: 'tool'; item: U }> {
  const merged: Array<
    { kind: 'message'; id: number; item: T } | { kind: 'tool'; id: number; item: U }
  > = [
    ...messages.map((item) => ({ kind: 'message' as const, id: item.id, item })),
    ...tools.map((item) => ({ kind: 'tool' as const, id: item.id, item })),
  ]
  merged.sort((a, b) => a.id - b.id)
  return merged.map(({ kind, item }) =>
    kind === 'message' ? { kind: 'message' as const, item } : { kind: 'tool' as const, item }
  )
}

/** Shift the oldest optimistic user-message id (FIFO, matches send / SSE order). */
export function shiftPendingUserMessageId(pendingIds: number[]): number | undefined {
  return pendingIds.shift()
}

/** Drop the most recently registered optimistic id (failed send). */
export function popPendingUserMessageId(pendingIds: number[]): number | undefined {
  return pendingIds.pop()
}

/** Apply core `user_message` SSE to chat, or append when there is no pending optimistic bubble. */
export function reconcileUserMessageInChat<T extends { id: number; content: string }>(
  messages: readonly T[],
  pendingMessageId: number | undefined,
  serverText: string,
  createMessage: (id: number, content: string) => T,
  nextId: () => number
): T[] {
  if (pendingMessageId !== undefined) {
    return messages.map((m) =>
      m.id === pendingMessageId ? { ...m, content: serverText } : m
    )
  }
  return [...messages, createMessage(nextId(), serverText)]
}

export function removeChatMessageById<T extends { id: number }>(
  messages: readonly T[],
  messageId: number | undefined
): T[] {
  if (messageId === undefined) return [...messages]
  return messages.filter((m) => m.id !== messageId)
}
