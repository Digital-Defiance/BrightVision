/** Heuristics for “thinking” vs likely stall during an in-flight turn. */

import { isOllamaVisionModel } from '../ipc/localLlm'
import { formatDurationMs } from './thinkingTiming'

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
  /** Ms since last tool_output / tool_error (UI), or null if none this turn. */
  sinceLastToolMs: number | null
  /** Ms since last meaningful activity (event, tool, or token). */
  sinceLastActivityMs: number
  /** Ms since last `token` event, or null if none this turn. */
  sinceLastTokenMs: number | null
  lastProgressDetail: string
}

export interface TurnActivityHintOptions {
  isAgentTurn?: boolean
  brightDate?: boolean
}

/** UI hint only — does not abort the turn (SSE idle timeout is separate). */
const STALL_WARN_MS = 300_000
const STREAMING_RECENT_MS = 8_000
/** Recent tool output resets “stuck” heuristics (agent can be busy without tokens). */
const TOOL_ACTIVITY_RECENT_MS = 90_000
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
  now = Date.now(),
  lastToolAt: number | null = null
): TurnActivitySnapshot {
  if (!isBusy || lastEventAt === null) {
    return {
      kind: 'idle',
      sinceLastEventMs: 0,
      sinceLastToolMs: null,
      sinceLastActivityMs: 0,
      sinceLastTokenMs: null,
      lastProgressDetail,
    }
  }
  const sinceLastEventMs = Math.max(0, now - lastEventAt)
  const sinceLastTokenMs =
    lastTokenAt !== null ? Math.max(0, now - lastTokenAt) : null
  const sinceLastToolMs =
    lastToolAt !== null ? Math.max(0, now - lastToolAt) : null
  let lastActivityAt = lastEventAt
  if (lastToolAt != null) lastActivityAt = Math.max(lastActivityAt, lastToolAt)
  if (lastTokenAt != null) lastActivityAt = Math.max(lastActivityAt, lastTokenAt)
  const sinceLastActivityMs = Math.max(0, now - lastActivityAt)
  const hay = lastProgressDetail.toLowerCase()

  let kind: TurnActivityKind = 'unknown'
  if (sinceLastTokenMs !== null && sinceLastTokenMs < STREAMING_RECENT_MS) {
    kind = 'streaming'
  } else if (sinceLastToolMs !== null && sinceLastToolMs < TOOL_ACTIVITY_RECENT_MS) {
    kind = 'tool'
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

  return {
    sinceLastEventMs,
    sinceLastToolMs,
    sinceLastActivityMs,
    sinceLastTokenMs,
    lastProgressDetail,
    kind,
  }
}

export function isLikelyStalled(activity: TurnActivitySnapshot): boolean {
  if (activity.kind === 'idle') return false
  if (activity.kind === 'streaming') return false
  if (activity.kind === 'tool' || activity.kind === 'confirm') return false

  if (activity.kind === 'waiting_model' || activity.kind === 'post_answer_wait') {
    if (activity.sinceLastActivityMs >= WAITING_STALL_MS) return true
    return false
  }

  return activity.sinceLastActivityMs >= STALL_WARN_MS
}

function formatStallDuration(ms: number, brightDate?: boolean): string {
  return formatDurationMs(ms, { brightDate })
}

function waitingModelHint(
  activity: TurnActivitySnapshot,
  queuedCount: number,
  sessionModel: string | undefined,
  brightDate?: boolean
): string {
  const idleLabel = formatStallDuration(activity.sinceLastActivityMs, brightDate)
  const local = isLocalLlmSession(sessionModel)
  let base = local
    ? 'Waiting for the local model (Ollama load can be idle on CPU — not the same as generating tokens).'
    : 'Waiting for the cloud LLM (API latency — not the same as streaming tokens yet).'
  if (activity.sinceLastActivityMs >= WAITING_STALL_MS) {
    base = local
      ? `Waiting for Ollama for ${idleLabel} — likely stuck. Stop, Ping stack, check ollama ps, or Force FAST for UI-style tasks.`
      : `Waiting for cloud LLM for ${idleLabel} — likely stuck. Stop, verify OPENAI_API_KEY / OPENAI_API_BASE in the shell that launched the app, then retry.`
  } else if (activity.sinceLastActivityMs >= WAITING_WARN_MS) {
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
  sessionModel?: string,
  opts?: TurnActivityHintOptions
): string {
  const local = isLocalLlmSession(sessionModel)
  const agent = Boolean(opts?.isAgentTurn)
  const brightDate = opts?.brightDate
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
    return waitingModelHint(activity, queuedCount, sessionModel, brightDate)
  }

  if (activity.kind === 'tool') {
    const base = agent
      ? 'Agent is running tools — new chat tokens may pause while shell or repo work runs.'
      : 'Tools are running — the model may not stream tokens during command output.'
    if (queuedCount > 0) {
      return `${base} ${queuedCount} message${queuedCount === 1 ? '' : 's'} queued until this turn completes.`
    }
    return base
  }

  if (activity.kind === 'post_answer_wait') {
    const idleLabel = formatStallDuration(
      activity.sinceLastTokenMs ?? activity.sinceLastActivityMs,
      brightDate
    )
    let base = agent
      ? 'Answer is visible but the agent has not finished — it may still be waiting on the model, running tools, or repo work. Queued messages send when the agent completes this turn.'
      : local
        ? 'Answer is visible but the turn has not finished — core may be waiting on Ollama (check Settings → Ollama models /api/ps) or repo work. Queued /add messages will not run until the turn ends.'
        : 'Answer is visible but the turn has not finished — core may be waiting on the cloud API or repo work. Queued /add messages will not run until the turn ends.'
    if (activity.sinceLastActivityMs >= WAITING_STALL_MS) {
      base = agent
        ? `Answer visible but no progress for ${idleLabel} — agent may be stuck. Stop, Force FAST, or Ping stack, then retry.`
        : local
          ? `Answer visible but no progress for ${idleLabel} — likely stuck on heavy Ollama or repo work. Stop, Force FAST, Ping stack, then retry.`
          : `Answer visible but no progress for ${idleLabel} — likely stuck on cloud LLM or repo work. Stop, verify cloud env, then retry.`
    } else if (activity.sinceLastActivityMs >= WAITING_WARN_MS) {
      base += agent ? ' If this persists, Stop the agent turn.' : ' If this persists, Stop or Force FAST.'
    }
    if (queuedCount > 0) {
      return `${base} Use Add all on suggested files while busy, Clear queue, or Stop — then Ping stack and retry.`
    }
    return `${base} If this persists, Stop the turn or wait for the long SSE timeout.`
  }

  if (isLikelyStalled(activity)) {
    const sec = formatStallDuration(activity.sinceLastActivityMs, brightDate)
    const tail = local
      ? 'Try Stop, check Terminal / Ollama, then retry.'
      : 'Try Stop, check Terminal and cloud API env, then retry.'
    return `No core activity for ${sec} — likely stuck (not thinking). ${tail} Clear the queue if you queued many /add messages.`
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
