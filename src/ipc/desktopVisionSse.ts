/**
 * Desktop Vision API message turns (SSE) via Tauri Channel + reqwest.
 * WebKit `fetch` POST to localhost often fails with "Load failed".
 */
import { Channel, invoke } from '@tauri-apps/api/core'
import type { CoreEventBase } from './events'
import { isCoreEvent } from './events'
import type { SendMessageOptions } from './httpClient'
import {
  SSE_IDLE_MS_AFTER_EVENT,
  SSE_IDLE_MS_BEFORE_FIRST,
  SseIdleTimeoutError,
  sseEventResetsIdleTimer,
} from './httpClient'

export async function* desktopVisionSendMessage(
  baseUrl: string,
  sessionId: string,
  bearerToken: string | undefined,
  content: string,
  options: SendMessageOptions | undefined,
  signal?: AbortSignal
): AsyncGenerator<CoreEventBase> {
  const channel = new Channel<CoreEventBase>()
  const queue: CoreEventBase[] = []
  let streamDone = false
  let streamError: Error | null = null
  let notify: (() => void) | null = null

  const wake = () => {
    const n = notify
    notify = null
    n?.()
  }

  channel.onmessage = (event) => {
    queue.push(event)
    wake()
  }

  const body = {
    content,
    preproc: options?.preproc ?? true,
    active_todo_id: options?.activeTodoId ?? null,
    inject_todo_spec: options?.injectTodoSpec ?? false,
    spec_focus: options?.specFocus ?? false,
    force_tier: options?.forceTier ?? null,
    escalate_from_last: options?.escalateFromLast ?? false,
  }

  const invokeDone = invoke<void>('send_vision_message', {
    onEvent: channel,
    baseUrl,
    sessionId,
    bearerToken: bearerToken ?? null,
    body,
  })
    .then(() => {
      streamDone = true
      wake()
    })
    .catch((err: unknown) => {
      streamError = err instanceof Error ? err : new Error(String(err))
      streamDone = true
      wake()
    })

  const onAbort = () => {
    void invoke('cancel_vision_message')
  }
  signal?.addEventListener('abort', onAbort)

  let streamActivity = false
  try {
    while (true) {
      if (queue.length === 0 && !streamDone) {
        const phase = streamActivity ? 'after_events' : 'before_first_event'
        await Promise.race([
          new Promise<void>((resolve) => {
            notify = resolve
          }),
          new Promise<void>((_, reject) => {
            setTimeout(
              () => reject(new SseIdleTimeoutError(phase)),
              streamActivity ? SSE_IDLE_MS_AFTER_EVENT : SSE_IDLE_MS_BEFORE_FIRST
            )
          }),
        ])
      }

      while (queue.length > 0) {
        const event = queue.shift()!
        if (!isCoreEvent(event)) continue
        if (sseEventResetsIdleTimer(event)) streamActivity = true
        yield event
      }

      if (streamError) throw streamError
      if (streamDone) break
      if (signal?.aborted) break
    }
  } finally {
    signal?.removeEventListener('abort', onAbort)
    await invokeDone.catch(() => {})
  }
}
