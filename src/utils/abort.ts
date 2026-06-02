/** True when the user hit Stop or the SSE fetch was aborted (not a product failure). */
export function isUserCancellationError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true
    const msg = err.message.toLowerCase()
    if (msg.includes('abort') || msg.includes('cancel')) return true
  }
  return false
}

/** Core ``error`` SSE text that should not flash the activity bar after Stop. */
export function isBenignTurnStopError(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/abort|cancel/i.test(t)) return true
  if (/keyboardinterrupt|interrupted during/i.test(t)) return true
  if (/broken\s*pipe/i.test(t)) return true
  if (/bgpucap/i.test(t) && /timed out after/i.test(t)) return true
  return false
}

/** Combine abort signals; aborts when any source aborts. */
export function mergeAbortSignals(...sources: (AbortSignal | undefined)[]): AbortSignal {
  const controller = new AbortController()
  const abort = () => controller.abort()
  for (const source of sources) {
    if (!source) continue
    if (source.aborted) {
      abort()
      return controller.signal
    }
    source.addEventListener('abort', abort, { once: true })
  }
  return controller.signal
}

export function abortAfter(ms: number, parent?: AbortSignal): AbortSignal {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  const cleanup = () => clearTimeout(id)
  if (parent) {
    if (parent.aborted) {
      cleanup()
      controller.abort()
    } else {
      parent.addEventListener(
        'abort',
        () => {
          cleanup()
          controller.abort()
        },
        { once: true }
      )
    }
  }
  controller.signal.addEventListener('abort', cleanup, { once: true })
  return controller.signal
}
