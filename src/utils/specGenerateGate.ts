/** Why Generate / Refine spec controls are disabled (null = ready). */
export function specGenerateBlockedReason(opts: {
  hasTask: boolean
  todosHttpReady: boolean
  isRunning: boolean
  specGenerating?: boolean
  sessionBusy?: boolean
}): string | null {
  if (opts.specGenerating) return 'Spec generation is already running.'
  if (opts.sessionBusy) return 'Wait for the current chat turn to finish, then try again.'
  if (!opts.todosHttpReady) {
    return 'Vision API is not connected — use Chat → Start (or Terminal → Start Vision API).'
  }
  if (!opts.isRunning) {
    return 'Start a coding session — Chat tab → Start (launches LLM, Vision API, and session).'
  }
  if (!opts.hasTask) {
    return 'Create a task on the Tasks tab and set it active (or select one on Tasks for Generate spec).'
  }
  return null
}
