export type SessionMode = 'vibe' | 'spec'

/** Whether the toggle matches the running session or is waiting for Stop → Start. */
export type SessionModeSync = 'idle' | 'live' | 'pending'

export function sessionModeSync(opts: {
  sessionRunning: boolean
  liveMode: SessionMode | null
  selectedMode: SessionMode
}): SessionModeSync {
  if (!opts.sessionRunning || opts.liveMode == null) return 'idle'
  return opts.selectedMode === opts.liveMode ? 'live' : 'pending'
}

export function sessionModeSyncHint(
  sync: SessionModeSync,
  liveMode: SessionMode | null,
  selectedMode: SessionMode
): string {
  if (sync === 'live' && liveMode) {
    return `${liveMode === 'spec' ? 'Spec' : 'Vibe'} mode is active in this session`
  }
  if (sync === 'pending' && liveMode) {
    const live = liveMode === 'spec' ? 'Spec' : 'Vibe'
    const next = selectedMode === 'spec' ? 'Spec' : 'Vibe'
    return `${next} selected — running session is still ${live}. Stop and Start to apply.`
  }
  return 'Applies when you Terminal → Start'
}
