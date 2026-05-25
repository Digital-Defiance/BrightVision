/** Heuristics for “thinking” vs likely stall during an in-flight turn. */

export type TurnActivityKind =
  | 'idle'
  | 'waiting_model'
  | 'post_answer_wait'
  | 'streaming'
  | 'tool'
  | 'confirm'
  | 'unknown'

export interface TurnActivitySnapshot {
  kind: TurnActivityKind
  /** Ms since last SSE event of any type. */
  sinceLastEventMs: number
  /** Ms since last `token` event, or null if none this turn. */
  sinceLastTokenMs: number | null
  lastProgressDetail: string
}

/** UI hint only — does not abort the turn (SSE idle timeout is separate). */
const STALL_WARN_MS = 300_000
const STREAMING_RECENT_MS = 8_000

const PROGRESS_WORKING_RE =
  /waiting for|preparing|ollama|slash command|repo|scanning|vision|llm|working/i

export function buildTurnActivity(
  isBusy: boolean,
  lastEventAt: number | null,
  lastTokenAt: number | null,
  lastProgressDetail: string,
  now = Date.now()
): TurnActivitySnapshot {
  if (!isBusy || lastEventAt === null) {
    return {
      kind: 'idle',
      sinceLastEventMs: 0,
      sinceLastTokenMs: null,
      lastProgressDetail,
    }
  }
  const sinceLastEventMs = Math.max(0, now - lastEventAt)
  const sinceLastTokenMs =
    lastTokenAt !== null ? Math.max(0, now - lastTokenAt) : null
  const hay = lastProgressDetail.toLowerCase()

  let kind: TurnActivityKind = 'unknown'
  if (sinceLastTokenMs !== null && sinceLastTokenMs < STREAMING_RECENT_MS) {
    kind = 'streaming'
  } else if (
    PROGRESS_WORKING_RE.test(hay) &&
    sinceLastTokenMs !== null &&
    sinceLastTokenMs >= STREAMING_RECENT_MS
  ) {
    kind = 'post_answer_wait'
  } else if (PROGRESS_WORKING_RE.test(hay)) {
    kind = 'waiting_model'
  } else if (/tool|confirm/.test(hay)) {
    kind = /confirm/.test(hay) ? 'confirm' : 'tool'
  }

  return { sinceLastEventMs, sinceLastTokenMs, lastProgressDetail, kind }
}

export function isLikelyStalled(activity: TurnActivitySnapshot): boolean {
  if (activity.kind === 'idle') return false
  if (
    activity.kind === 'streaming' ||
    activity.kind === 'waiting_model' ||
    activity.kind === 'post_answer_wait' ||
    activity.kind === 'tool' ||
    activity.kind === 'confirm'
  ) {
    return false
  }
  return activity.sinceLastEventMs >= STALL_WARN_MS
}

export function turnActivityHint(
  activity: TurnActivitySnapshot,
  queuedCount: number
): string {
  if (activity.kind === 'idle') {
    if (queuedCount > 0) {
      return `${queuedCount} message${queuedCount === 1 ? '' : 's'} queued — waiting for current turn to finish.`
    }
    return ''
  }

  if (activity.kind === 'streaming') {
    const base = 'Streaming response from the model.'
    if (queuedCount > 0) {
      return `${base} ${queuedCount} more queued after this turn.`
    }
    return base
  }

  if (activity.kind === 'waiting_model') {
    const base =
      'Waiting for the LLM (Ollama load can be idle on CPU — not the same as generating tokens).'
    if (queuedCount > 0) {
      return `${base} ${queuedCount} message${queuedCount === 1 ? '' : 's'} will send when this turn completes.`
    }
    return base
  }

  if (activity.kind === 'post_answer_wait') {
    const base =
      'Answer is visible but the turn has not finished — core may be waiting on Ollama (check Settings → Ollama models /api/ps) or repo work. Queued /add messages will not run until the turn ends.'
    if (queuedCount > 0) {
      return `${base} Use Add all on suggested files while busy, Clear queue, or Stop — then Ping LLM and retry.`
    }
    return `${base} If this persists, Stop the turn or wait for the long SSE timeout.`
  }

  if (isLikelyStalled(activity)) {
    const sec = Math.round(activity.sinceLastEventMs / 1000)
    return `No core activity for ${sec}s — likely stuck (not thinking). Try Stop, check Terminal / Ollama, then retry. Clear the queue if you queued many /add messages.`
  }

  if (queuedCount > 0) {
    return `Agent is working. ${queuedCount} message${queuedCount === 1 ? '' : 's'} queued for after this turn.`
  }

  return 'Agent is working — use Stop to cancel the current turn.'
}

export function formatSinceMs(ms: number): string {
  if (ms < 1000) return 'just now'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ${s % 60}s ago`
}
