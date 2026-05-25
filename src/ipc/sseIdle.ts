/** SSE read stalled — core HTTP stream open but no new events. */

export type SseIdlePhase = 'before_first_event' | 'after_events'

export class SseIdleTimeoutError extends Error {
  readonly phase: SseIdlePhase

  constructor(phase: SseIdlePhase) {
    super(
      phase === 'before_first_event'
        ? 'No response from Vision core for 5 minutes. Check that the core API is running and Ollama is up.'
        : 'Turn stalled — no events from core for 15 minutes. The model may still be working; check Terminal and Ollama (/api/ps). Use Stop and retry if needed.'
    )
    this.name = 'SseIdleTimeoutError'
    this.phase = phase
  }
}

/** First model byte can take many minutes on cold load / large repos. */
export const SSE_IDLE_MS_BEFORE_FIRST = 600_000
/** Local LLM turns often exceed 90s; progress heartbeats should reset this between pulses. */
export const SSE_IDLE_MS_AFTER_EVENT = 900_000

const SSE_IDLE_RESET_TYPES = new Set([
  'progress',
  'token',
  'tool_output',
  'tool_call',
  'tool_warning',
  'tool_error',
  'confirm',
  'done',
  'error',
  'assistant_complete',
])

/** `user_message` alone does not start the post-event idle clock (model work follows). */
export function sseEventResetsIdleTimer(ev: { type: string }): boolean {
  return SSE_IDLE_RESET_TYPES.has(ev.type)
}

export async function readStreamChunkWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  streamActivity: boolean
): Promise<ReadableStreamReadResult<Uint8Array>> {
  const limit = streamActivity ? SSE_IDLE_MS_AFTER_EVENT : SSE_IDLE_MS_BEFORE_FIRST
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      reader.read(),
      new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new SseIdleTimeoutError(
                streamActivity ? 'after_events' : 'before_first_event'
              )
            ),
          limit
        )
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
