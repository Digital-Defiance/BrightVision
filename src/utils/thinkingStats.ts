import { msPer1kPromptChars } from './thinkingTiming'

import { THINKING_STATS_STORAGE_KEY } from '../storageKeys'

export { THINKING_STATS_STORAGE_KEY }
export const MAX_TIMING_HISTORY = 300
/** Rows shown in Settings timing history table (newest first). */
export const TIMING_STATS_DISPLAY_ROWS = 7

/** @deprecated v1 aggregate — used only for migration */
interface ModelThinkingAggregateV1 {
  sampleCount: number
  totalThoughtMs: number
  totalPromptChars: number
  recent: Array<{
    at: string
    thoughtMs: number
    promptChars: number
    turnMs: number
  }>
}

interface ThinkingStatsStoreV1 {
  version: 1
  byModel: Record<string, ModelThinkingAggregateV1>
}

export interface TurnTimingRecord {
  id: string
  at: string
  model: string
  responseMs: number
  thinkMs: number
  promptChars: number
  /** Peak CPU % while the turn was active (desktop poll; optional). */
  peakCpuPct?: number
  /** Peak system RAM % during the turn. */
  peakMemPct?: number
  /** Peak GPU % when available (null = no GPU sample with a reading). */
  peakGpuPct?: number | null
}

export interface ThinkingStatsStore {
  version: 2
  history: TurnTimingRecord[]
}

export interface TimingDistribution {
  count: number
  min: number
  max: number
  mean: number
  median: number
  p90: number
  sum: number
}

export interface ModelTimingStats {
  model: string
  turns: number
  response: TimingDistribution
  think: TimingDistribution
  /** Mean think ÷ response (0–1) when response > 0. */
  avgThinkShare: number | null
  avgMsPer1kChars: number | null
  lastAt: string | null
}

export interface TimingStatsView {
  filterModel: string | null
  totalTurns: number
  modelsUsed: number
  response: TimingDistribution
  think: TimingDistribution
  avgThinkShare: number | null
  byModel: ModelTimingStats[]
  history: TurnTimingRecord[]
}

/** @deprecated Use ModelTimingStats via buildTimingStatsView */
export interface ModelThinkingSummary {
  model: string
  sampleCount: number
  avgThoughtMs: number
  avgMsPer1kChars: number | null
  avgTurnMs: number
}

export function emptyThinkingStatsStore(): ThinkingStatsStore {
  return { version: 2, history: [] }
}

/** Parse persisted or migrated store (for tests and import). */
export function parseThinkingStatsStore(parsed: unknown): ThinkingStatsStore {
  return normalizeStore(parsed)
}

function normalizeStore(parsed: unknown): ThinkingStatsStore {
  if (!parsed || typeof parsed !== 'object') return emptyThinkingStatsStore()
  const raw = parsed as { version?: number; history?: unknown; byModel?: unknown }
  if (raw.version === 2 && Array.isArray(raw.history)) {
    return {
      version: 2,
      history: raw.history
        .filter((r): r is TurnTimingRecord => isTurnRecord(r))
        .slice(-MAX_TIMING_HISTORY),
    }
  }
  if (raw.version === 1 && raw.byModel && typeof raw.byModel === 'object') {
    return migrateV1ToV2(raw as ThinkingStatsStoreV1)
  }
  return emptyThinkingStatsStore()
}

function isTurnRecord(r: unknown): r is TurnTimingRecord {
  if (!r || typeof r !== 'object') return false
  const x = r as TurnTimingRecord
  return (
    typeof x.id === 'string' &&
    typeof x.at === 'string' &&
    typeof x.model === 'string' &&
    typeof x.responseMs === 'number' &&
    typeof x.thinkMs === 'number' &&
    typeof x.promptChars === 'number'
  )
}

function migrateV1ToV2(v1: ThinkingStatsStoreV1): ThinkingStatsStore {
  const history: TurnTimingRecord[] = []
  for (const [model, agg] of Object.entries(v1.byModel)) {
    for (const s of agg.recent ?? []) {
      history.push({
        id: `${s.at}-${model}`,
        at: s.at,
        model,
        responseMs: s.turnMs,
        thinkMs: s.thoughtMs,
        promptChars: s.promptChars,
      })
    }
  }
  history.sort((a, b) => a.at.localeCompare(b.at))
  return { version: 2, history: history.slice(-MAX_TIMING_HISTORY) }
}

export function loadThinkingStats(): ThinkingStatsStore {
  try {
    const raw = localStorage.getItem(THINKING_STATS_STORAGE_KEY)
    if (!raw) return emptyThinkingStatsStore()
    return normalizeStore(JSON.parse(raw))
  } catch {
    return emptyThinkingStatsStore()
  }
}

export function saveThinkingStats(store: ThinkingStatsStore): void {
  localStorage.setItem(THINKING_STATS_STORAGE_KEY, JSON.stringify(store))
}

export function newTurnTimingId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function recordTurnTiming(
  store: ThinkingStatsStore,
  model: string,
  sample: {
    responseMs: number
    thinkMs: number
    promptChars: number
    peakCpuPct?: number
    peakMemPct?: number
    peakGpuPct?: number | null
  }
): ThinkingStatsStore {
  if (sample.responseMs <= 0 && sample.thinkMs <= 0) return store
  const key = model.trim() || 'unknown'
  const record: TurnTimingRecord = {
    id: newTurnTimingId(),
    at: new Date().toISOString(),
    model: key,
    responseMs: Math.max(0, sample.responseMs),
    thinkMs: Math.max(0, sample.thinkMs),
    promptChars: Math.max(0, sample.promptChars),
    ...(sample.peakCpuPct != null && sample.peakMemPct != null
      ? {
          peakCpuPct: sample.peakCpuPct,
          peakMemPct: sample.peakMemPct,
          peakGpuPct: sample.peakGpuPct ?? null,
        }
      : {}),
  }
  return {
    version: 2,
    history: [...store.history, record].slice(-MAX_TIMING_HISTORY),
  }
}

/** @deprecated Alias for recordTurnTiming */
export function recordThinkingSample(
  store: ThinkingStatsStore,
  model: string,
  sample: { thoughtMs: number; promptChars: number; turnMs: number }
): ThinkingStatsStore {
  return recordTurnTiming(store, model, {
    responseMs: sample.turnMs,
    thinkMs: sample.thoughtMs,
    promptChars: sample.promptChars,
  })
}

export function computeTimingDistribution(values: number[]): TimingDistribution {
  const nums = values.filter((n) => Number.isFinite(n) && n >= 0)
  if (nums.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, median: 0, p90: 0, sum: 0 }
  }
  const sorted = [...nums].sort((a, b) => a - b)
  const sum = sorted.reduce((n, v) => n + v, 0)
  const mean = sum / sorted.length
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    median: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    sum,
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))]
}

export function thinkShare(record: TurnTimingRecord): number | null {
  if (record.responseMs <= 0) return null
  return Math.min(1, record.thinkMs / record.responseMs)
}

export function buildModelTimingStats(records: TurnTimingRecord[]): ModelTimingStats | null {
  if (records.length === 0) return null
  const model = records[0].model
  const responses = records.map((r) => r.responseMs)
  const thinks = records.map((r) => r.thinkMs)
  const shares = records.map(thinkShare).filter((s): s is number => s != null)
  const avgPromptChars =
    records.reduce((n, r) => n + r.promptChars, 0) / Math.max(1, records.length)
  const avgThink = thinks.reduce((n, v) => n + v, 0) / Math.max(1, thinks.length)
  return {
    model,
    turns: records.length,
    response: computeTimingDistribution(responses),
    think: computeTimingDistribution(thinks),
    avgThinkShare: shares.length > 0 ? shares.reduce((n, v) => n + v, 0) / shares.length : null,
    avgMsPer1kChars: msPer1kPromptChars(avgThink, avgPromptChars),
    lastAt: records[records.length - 1]?.at ?? null,
  }
}

export function listModelsInHistory(store: ThinkingStatsStore): string[] {
  const set = new Set(store.history.map((r) => r.model))
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function buildTimingStatsView(
  store: ThinkingStatsStore,
  filterModel: string | null = null
): TimingStatsView {
  const all = store.history
  const filtered = filterModel
    ? all.filter((r) => r.model === (filterModel.trim() || 'unknown'))
    : all

  const byModelMap = new Map<string, TurnTimingRecord[]>()
  for (const r of all) {
    const list = byModelMap.get(r.model) ?? []
    list.push(r)
    byModelMap.set(r.model, list)
  }
  const byModel = [...byModelMap.entries()]
    .map(([, recs]) => buildModelTimingStats(recs))
    .filter((m): m is ModelTimingStats => m != null)
    .sort((a, b) => b.turns - a.turns)

  const shares = filtered
    .map(thinkShare)
    .filter((s): s is number => s != null)

  return {
    filterModel,
    totalTurns: filtered.length,
    modelsUsed: byModelMap.size,
    response: computeTimingDistribution(filtered.map((r) => r.responseMs)),
    think: computeTimingDistribution(filtered.map((r) => r.thinkMs)),
    avgThinkShare: shares.length > 0 ? shares.reduce((n, v) => n + v, 0) / shares.length : null,
    byModel,
    history: [...filtered].reverse().slice(0, TIMING_STATS_DISPLAY_ROWS),
  }
}

/** @deprecated Use buildModelTimingStats / buildTimingStatsView */
export function summarizeModelThinking(
  agg: ModelThinkingAggregateV1 | undefined,
  model: string
): ModelThinkingSummary | null {
  if (!agg || agg.sampleCount === 0) return null
  const records: TurnTimingRecord[] = (agg.recent ?? []).map((s) => ({
    id: s.at,
    at: s.at,
    model,
    responseMs: s.turnMs,
    thinkMs: s.thoughtMs,
    promptChars: s.promptChars,
  }))
  const stats = buildModelTimingStats(records)
  if (!stats) return null
  return {
    model,
    sampleCount: stats.turns,
    avgThoughtMs: stats.think.mean,
    avgMsPer1kChars: stats.avgMsPer1kChars,
    avgTurnMs: stats.response.mean,
  }
}

export function clearModelThinkingStats(
  store: ThinkingStatsStore,
  model: string
): ThinkingStatsStore {
  const key = model.trim() || 'unknown'
  return {
    version: 2,
    history: store.history.filter((r) => r.model !== key),
  }
}

export function clearAllThinkingStats(): ThinkingStatsStore {
  return emptyThinkingStatsStore()
}

export function exportThinkingStatsJson(store: ThinkingStatsStore): string {
  return JSON.stringify(store, null, 2)
}

export function formatThinkSharePct(share: number | null): string {
  if (share == null || !Number.isFinite(share)) return '—'
  return `${Math.round(share * 100)}%`
}
