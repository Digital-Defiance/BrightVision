/** SSE helpers for LLM e2e (mirrors tests/core/llm_sse.py). */

export type SseEvent = Record<string, unknown>

export function parseSsePayload(raw: string): SseEvent[] {
  const events: SseEvent[] = []
  for (const part of raw.split('\n\n')) {
    for (const line of part.split('\n')) {
      if (!line.startsWith('data: ')) continue
      events.push(JSON.parse(line.slice(6)) as SseEvent)
    }
  }
  return events
}

export function assistantText(events: SseEvent[]): string {
  const done = events.find((e) => e.type === 'done')
  if (done) {
    const fromDone = String(done.assistant_text ?? '').trim()
    if (fromDone) return fromDone
  }
  return events
    .filter((e) => e.type === 'token')
    .map((e) => String(e.text ?? ''))
    .join('')
}
