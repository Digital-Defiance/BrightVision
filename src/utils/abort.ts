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
