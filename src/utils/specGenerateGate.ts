/** Why Generate / Refine spec controls are disabled (null = ready). */
export function specGenerateBlockedReason(opts: {
  hasTask: boolean
  visionSessionReady: boolean
  specGenerating?: boolean
  sessionBusy?: boolean
  workspaceMismatch?: boolean
}): string | null {
  if (opts.specGenerating) return 'Spec generation is already running.'
  if (opts.sessionBusy) return 'Wait for the current chat turn to finish, then try again.'
  if (opts.workspaceMismatch) {
    return 'Chat session uses a different folder than the open project — Stop & Start in Chat, or switch project.'
  }
  if (!opts.visionSessionReady) {
    return 'Start a coding session — Chat tab → Start (launches LLM, Vision API, and session).'
  }
  if (!opts.hasTask) {
    return 'Create or select a task on the Tasks tab (it does not need to be the active task).'
  }
  return null
}
