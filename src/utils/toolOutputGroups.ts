import type { ToolEvent } from '../components/chat/ChatPanel'
import { parseAgentJsonText } from './jsonParse'

const TOOL_CALL_RE = /^Tool Call:\s*(Local|Server)\s*•\s*(.+)$/i
const ARGUMENTS_RE = /^Arguments:\s*(.+)$/is
const RANGE_RE = /^range_(\d+):\s*(.+?)\s*•\s*(.+?)\s*•\s*(.+)$/i

export interface ToolInvocationGroup {
  kind: 'invocation'
  /** First SSE event id (timeline sort key). */
  id: number
  eventIds: number[]
  scope: 'Local' | 'Server'
  toolName: string
  args: unknown | null
  ranges: Array<{ index: number; file: string; start: string; end: string }>
  results: string[]
  error?: string
  failed: boolean
}

export type GroupedToolItem = ToolInvocationGroup | { kind: 'standalone'; item: ToolEvent }

export function parseToolCallLine(text: string): { scope: 'Local' | 'Server'; toolName: string } | null {
  const m = TOOL_CALL_RE.exec(text.trim())
  if (!m) return null
  return {
    scope: m[1].toLowerCase() === 'server' ? 'Server' : 'Local',
    toolName: m[2].trim(),
  }
}

export function parseArgumentsLine(text: string): unknown | null {
  const m = ARGUMENTS_RE.exec(text.trim())
  if (!m) return null
  return parseAgentJsonText(m[1].trim())
}

export function parseRangeLine(
  text: string
): { index: number; file: string; start: string; end: string } | null {
  const m = RANGE_RE.exec(text.trim())
  if (!m) return null
  return {
    index: Number(m[1]),
    file: m[2].trim(),
    start: m[3].trim(),
    end: m[4].trim(),
  }
}

function createEmptyGroup(id: number, scope: 'Local' | 'Server', toolName: string): ToolInvocationGroup {
  return {
    kind: 'invocation',
    id,
    eventIds: [id],
    scope,
    toolName,
    args: null,
    ranges: [],
    results: [],
    failed: false,
  }
}

/** Fold flat core tool_output lines into logical invocation groups. */
export function groupToolEvents(events: readonly ToolEvent[]): GroupedToolItem[] {
  const out: GroupedToolItem[] = []
  let current: ToolInvocationGroup | null = null

  const flush = () => {
    if (!current) return
    out.push(current)
    current = null
  }

  for (const ev of events) {
    if (ev.type === 'tool_warning') {
      flush()
      out.push({ kind: 'standalone', item: ev })
      continue
    }

    const text = (ev.output ?? ev.input ?? '').trim()
    if (!text) continue

    if (ev.name === 'error') {
      if (current) {
        current.error = text
        current.failed = true
        current.eventIds.push(ev.id)
        flush()
      } else {
        out.push({
          kind: 'standalone',
          item: { ...ev, type: 'tool_result', name: 'error', output: text },
        })
      }
      continue
    }

    const call = parseToolCallLine(text)
    if (call) {
      flush()
      current = createEmptyGroup(ev.id, call.scope, call.toolName)
      continue
    }

    const args = parseArgumentsLine(text)
    if (args !== null) {
      if (current) {
        current.args = args
        current.eventIds.push(ev.id)
      } else {
        out.push({
          kind: 'standalone',
          item: { ...ev, type: 'tool_result', name: 'output', output: text },
        })
      }
      continue
    }

    const range = parseRangeLine(text)
    if (range) {
      if (current) {
        current.ranges.push(range)
        current.eventIds.push(ev.id)
      } else {
        out.push({
          kind: 'standalone',
          item: { ...ev, type: 'tool_result', name: 'output', output: text },
        })
      }
      continue
    }

    if (current) {
      current.results.push(text)
      current.eventIds.push(ev.id)
      continue
    }

    out.push({
      kind: 'standalone',
      item: { ...ev, type: 'tool_result', name: ev.name ?? 'output', output: text },
    })
  }

  flush()
  return out
}

export type ChatTimelineEntry<T extends { id: number }> =
  | { kind: 'message'; item: T }
  | { kind: 'tool'; item: ToolEvent }
  | { kind: 'tool_group'; item: ToolInvocationGroup }

/** Merge messages and tools; coalesce consecutive tool bubbles into invocation groups. */
export function mergeChatTimelineGrouped<T extends { id: number }>(
  messages: readonly T[],
  tools: readonly ToolEvent[]
): Array<ChatTimelineEntry<T>> {
  const merged: Array<
    | { kind: 'message'; id: number; item: T }
    | { kind: 'tool'; id: number; item: ToolEvent }
  > = [
    ...messages.map((item) => ({ kind: 'message' as const, id: item.id, item })),
    ...tools.map((item) => ({ kind: 'tool' as const, id: item.id, item })),
  ]
  merged.sort((a, b) => a.id - b.id)

  const result: Array<ChatTimelineEntry<T>> = []
  let toolRun: ToolEvent[] = []

  const flushTools = () => {
    if (toolRun.length === 0) return
    for (const grouped of groupToolEvents(toolRun)) {
      if (grouped.kind === 'invocation') {
        result.push({ kind: 'tool_group', item: grouped })
      } else {
        result.push({ kind: 'tool', item: grouped.item })
      }
    }
    toolRun = []
  }

  for (const entry of merged) {
    if (entry.kind === 'message') {
      flushTools()
      result.push({ kind: 'message', item: entry.item })
    } else {
      toolRun.push(entry.item)
    }
  }
  flushTools()
  return result
}
