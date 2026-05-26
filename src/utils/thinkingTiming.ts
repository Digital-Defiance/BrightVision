import type { AssistantSection, AssistantSectionKind } from './chatStream'
import { getActiveAssistantSection } from './chatStream'

/** Wall-clock from Send until the turn completes (includes queue + model wait + streaming). */
export type ResponseElapsedMs = number

export interface LiveThinkingState {
  responseElapsedMs: ResponseElapsedMs
  /** Time in Thinking / Reasoning sections only (excludes queue wait and Answer). */
  thoughtElapsedMs: number
  activeKind: AssistantSectionKind | null
  activeElapsedMs: number
  phaseLabel: string
}

function phaseLabelForKind(kind: AssistantSectionKind | null): string {
  if (kind === 'thinking') return 'Thinking'
  if (kind === 'reasoning') return 'Reasoning'
  if (kind === 'answer') return 'Answer'
  if (kind === 'body') return 'Working'
  return 'Waiting for model'
}

export interface SectionDuration {
  kind: AssistantSectionKind
  durationMs: number
}

export interface TurnThinkingTiming {
  /** Wall-clock response time: Send → turn done (same as live `responseElapsedMs` at finalize). */
  turnDurationMs: number
  sections: SectionDuration[]
  userPromptChars: number
  /** Think time: sum of Thinking + Reasoning section durations only. */
  thoughtMs: number
}

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return `${m}m ${rem.toFixed(0)}s`
}

export function isThoughtSection(kind: AssistantSectionKind): boolean {
  return kind === 'thinking' || kind === 'reasoning'
}

export function sumThoughtMs(sections: SectionDuration[]): number {
  return sections.filter((s) => isThoughtSection(s.kind)).reduce((n, s) => n + s.durationMs, 0)
}

/** Elapsed think time for the current turn (closed sections + open thinking/reasoning slice). */
export function computeLiveThoughtMs(tracker: TurnTimingTracker, now = Date.now()): number {
  let ms = sumThoughtMs(tracker.sections)
  if (tracker.activeKind !== null && isThoughtSection(tracker.activeKind)) {
    ms += Math.max(0, now - tracker.activeStartMs)
  }
  return ms
}

export function buildLiveThinkingState(
  tracker: TurnTimingTracker,
  now = Date.now()
): LiveThinkingState {
  const kind = tracker.activeKind
  return {
    responseElapsedMs: Math.max(0, now - tracker.turnStartMs),
    thoughtElapsedMs: computeLiveThoughtMs(tracker, now),
    activeKind: kind,
    activeElapsedMs: kind !== null ? Math.max(0, now - tracker.activeStartMs) : 0,
    phaseLabel: phaseLabelForKind(kind),
  }
}

/** Map section index in `splitAssistantSections` output → duration ms (when kinds align in order). */
export function sectionDurationByIndex(
  contentSections: AssistantSection[],
  durations: SectionDuration[]
): Map<number, number> {
  const map = new Map<number, number>()
  let di = 0
  for (let si = 0; si < contentSections.length; si++) {
    const sec = contentSections[si]
    if (sec.kind === 'body') continue
    while (di < durations.length && durations[di].kind !== sec.kind) di++
    if (di < durations.length && durations[di].kind === sec.kind) {
      map.set(si, durations[di].durationMs)
      di++
    }
  }
  return map
}

export interface TurnTimingTracker {
  turnStartMs: number
  userPromptChars: number
  sections: SectionDuration[]
  activeKind: AssistantSectionKind | null
  activeStartMs: number
}

export function createTurnTimingTracker(promptChars: number, now = Date.now()): TurnTimingTracker {
  return {
    turnStartMs: now,
    userPromptChars: promptChars,
    sections: [],
    activeKind: null,
    activeStartMs: now,
  }
}

export function syncTurnTimingFromContent(
  tracker: TurnTimingTracker,
  content: string,
  now = Date.now()
): TurnTimingTracker {
  const kind = getActiveAssistantSection(content)
  if (tracker.activeKind === null) {
    return { ...tracker, activeKind: kind, activeStartMs: now }
  }
  if (kind === tracker.activeKind) return tracker
  const closed: SectionDuration = {
    kind: tracker.activeKind,
    durationMs: Math.max(0, now - tracker.activeStartMs),
  }
  return {
    ...tracker,
    sections: [...tracker.sections, closed],
    activeKind: kind,
    activeStartMs: now,
  }
}

export interface FinalizeTurnTimingOptions {
  /** Wall-clock Send time; overrides tracker.turnStartMs for turnDurationMs. */
  turnStartMs?: number
}

export function finalizeTurnTiming(
  tracker: TurnTimingTracker,
  content: string,
  now = Date.now(),
  opts?: FinalizeTurnTimingOptions
): TurnThinkingTiming {
  let t = syncTurnTimingFromContent(tracker, content, now)
  const sections = [...t.sections]
  if (t.activeKind !== null) {
    sections.push({
      kind: t.activeKind,
      durationMs: Math.max(0, now - t.activeStartMs),
    })
  }
  const wallStart = opts?.turnStartMs ?? t.turnStartMs
  const turnDurationMs = Math.max(0, now - wallStart)
  return {
    turnDurationMs,
    sections,
    userPromptChars: t.userPromptChars,
    thoughtMs: sumThoughtMs(sections),
  }
}

/** Finalize when the live tracker was cleared (e.g. Stop) but Send wall-clock is still known. */
export function finalizeTurnTimingFromWallClock(
  turnStartMs: number,
  promptChars: number,
  content: string,
  now = Date.now()
): TurnThinkingTiming {
  const tracker = createTurnTimingTracker(promptChars, turnStartMs)
  return finalizeTurnTiming(tracker, content, now, { turnStartMs })
}

export function msPer1kPromptChars(thoughtMs: number, promptChars: number): number | null {
  if (promptChars <= 0 || thoughtMs <= 0) return null
  return (thoughtMs / promptChars) * 1000
}
