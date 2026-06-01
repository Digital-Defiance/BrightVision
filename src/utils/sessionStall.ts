/** Heuristics for “thinking” vs likely stall during an in-flight turn. */

import { isOllamaVisionModel } from '../ipc/localLlm'

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
/** No tokens / long Ollama wait — suggest Stop or Force FAST. */
const WAITING_STALL_MS = 8 * 60_000
const WAITING_WARN_MS = 3 * 60_000

const PROGRESS_WORKING_RE =
  /waiting for|preparing|ollama|cloud llm|slash command|repo|scanning|vision|llm|working/i

function isLocalLlmSession(sessionModel: string | undefined): boolean {
  const m = sessionModel?.trim()
  if (!m) return true
  return isOllamaVisionModel(m)
}

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
  if (activity.kind === 'streaming') return false

  if (activity.kind === 'waiting_model' || activity.kind === 'post_answer_wait') {
    if (activity.sinceLastEventMs >= WAITING_STALL_MS) return true
    if (
      activity.kind === 'post_answer_wait' &&
      activity.sinceLastTokenMs !== null &&
      activity.sinceLastTokenMs >= WAITING_STALL_MS
    ) {
      return true
    }
    return false
  }

  if (activity.kind === 'tool' || activity.kind === 'confirm') {
    return false
  }
  return activity.sinceLastEventMs >= STALL_WARN_MS
}

function waitingModelHint(
  activity: TurnActivitySnapshot,
  queuedCount: number,
  sessionModel: string | undefined
): string {
  const min = Math.round(activity.sinceLastEventMs / 60_000)
  const local = isLocalLlmSession(sessionModel)
  let base = local
    ? 'Waiting for the local model (Ollama load can be idle on CPU — not the same as generating tokens).'
    : 'Waiting for the cloud LLM (API latency — not the same as streaming tokens yet).'
  if (activity.sinceLastEventMs >= WAITING_STALL_MS) {
    base = local
      ? `Waiting for Ollama for ${min}+ min — likely stuck. Stop, Ping stack, check ollama ps, or Force FAST for UI-style tasks.`
      : `Waiting for cloud LLM for ${min}+ min — likely stuck. Stop, verify OPENAI_API_KEY / OPENAI_API_BASE in the shell that launched the app, then retry.`
  } else if (activity.sinceLastEventMs >= WAITING_WARN_MS) {
    base += local
      ? ' Taking a long time — try Stop, Force FAST (chat bar), or Terminal → Local LLM → Start.'
      : ' Taking a long time — try Stop, confirm Settings model and cloud env, then retry.'
  }
  if (queuedCount > 0) {
    return `${base} ${queuedCount} message${queuedCount === 1 ? '' : 's'} will send when this turn completes.`
  }
  return base
}

export function turnActivityHint(
  activity: TurnActivitySnapshot,
  queuedCount: number,
  sessionModel?: string
): string {
  const local = isLocalLlmSession(sessionModel)
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
    return waitingModelHint(activity, queuedCount, sessionModel)
  }

  if (activity.kind === 'post_answer_wait') {
    const min = Math.round((activity.sinceLastTokenMs ?? activity.sinceLastEventMs) / 60_000)
    let base = local
      ? 'Answer is visible but the turn has not finished — core may be waiting on Ollama (check Settings → Ollama models /api/ps) or repo work. Queued /add messages will not run until the turn ends.'
      : 'Answer is visible but the turn has not finished — core may be waiting on the cloud API or repo work. Queued /add messages will not run until the turn ends.'
    if (activity.sinceLastEventMs >= WAITING_STALL_MS || (activity.sinceLastTokenMs ?? 0) >= WAITING_STALL_MS) {
      base = local
        ? `Answer visible but no progress for ${min}+ min — likely stuck on heavy Ollama or repo work. Stop, Force FAST, Ping stack, then retry.`
        : `Answer visible but no progress for ${min}+ min — likely stuck on cloud LLM or repo work. Stop, verify cloud env, then retry.`
    } else if (activity.sinceLastEventMs >= WAITING_WARN_MS) {
      base += ' If this persists, Stop or Force FAST.'
    }
    if (queuedCount > 0) {
      return `${base} Use Add all on suggested files while busy, Clear queue, or Stop — then Ping stack and retry.`
    }
    return `${base} If this persists, Stop the turn or wait for the long SSE timeout.`
  }

  if (isLikelyStalled(activity)) {
    const sec = Math.round(activity.sinceLastEventMs / 1000)
    const tail = local
      ? 'Try Stop, check Terminal / Ollama, then retry.'
      : 'Try Stop, check Terminal and cloud API env, then retry.'
    return `No core activity for ${sec}s — likely stuck (not thinking). ${tail} Clear the queue if you queued many /add messages.`
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
