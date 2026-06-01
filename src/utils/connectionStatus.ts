/** Header dot + caption when Vision API is up but no coding session yet. */
export type ConnectionTone = 'stopped' | 'ready' | 'live' | 'starting'

export function resolveConnectionTone(opts: {
  isStarting: boolean
  isRunning: boolean
  apiReachable: boolean | null
}): ConnectionTone {
  if (opts.isStarting) return 'starting'
  if (opts.isRunning) return 'live'
  if (opts.apiReachable === true) return 'ready'
  return 'stopped'
}

export function resolveConnectionStatusLabel(opts: {
  statusMessage: string
  isStarting: boolean
  isRunning: boolean
  apiReachable: boolean | null
}): string {
  if (opts.statusMessage.trim()) return opts.statusMessage.trim()
  if (opts.isStarting) return 'Starting…'
  if (opts.isRunning) return 'Session live'
  if (opts.apiReachable === true) return 'API up — Terminal → Start'
  return 'Stopped'
}
