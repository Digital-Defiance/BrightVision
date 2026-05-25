/** Format SSE bodies for mocked Vision API message streams. */
export function formatSse(events: Record<string, unknown>[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
}
