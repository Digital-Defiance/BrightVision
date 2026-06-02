import type { ThinkingStatsStore } from './thinkingStats'
import { formatDurationMs } from './thinkingTiming'
import { formatOutputTps, computeOutputTps, thinkShare } from './thinkingStats'

function formatMemPressure(peak?: number): string {
  if (peak == null || !Number.isFinite(peak)) return '—'
  const labels = ['normal', 'warn', 'critical'] as const
  return labels[peak] ?? String(peak)
}

/** Markdown table of recent turn timings for in-chat `/turns`. */
export function formatTurnsTableMarkdown(
  store: ThinkingStatsStore,
  opts?: { brightDate?: boolean; maxRows?: number }
): string {
  const rows = store.history.slice(0, opts?.maxRows ?? 12)
  if (!rows.length) {
    return 'No completed turns recorded yet. Finish a chat turn with **Thinking timers** enabled, then run `/turns` again.'
  }
  const fmt = { brightDate: opts?.brightDate }
  const lines = [
    '| When | Model | Response | Think | TPS | Mem pressure |',
    '| --- | --- | --- | --- | --- | --- |',
  ]
  for (const row of rows) {
    const when = new Date(row.at).toLocaleString()
    const model = row.model.length > 28 ? `${row.model.slice(0, 25)}…` : row.model
    const tps = formatOutputTps(computeOutputTps(row.tokensReceived, row.responseMs))
    const thinkPct =
      thinkShare(row) != null ? `${Math.round((thinkShare(row) ?? 0) * 100)}%` : '—'
    lines.push(
      `| ${when} | ${model} | ${formatDurationMs(row.responseMs, fmt)} | ${formatDurationMs(row.thinkMs, fmt)} (${thinkPct}) | ${tps} | ${formatMemPressure(row.memPressurePeak)} |`
    )
  }
  return lines.join('\n')
}

export function appendTurnsTableToChat(
  store: ThinkingStatsStore,
  appendSystemMessage: (content: string) => void,
  opts?: { brightDate?: boolean }
): void {
  const table = formatTurnsTableMarkdown(store, opts)
  appendSystemMessage(
    `**Turn history** (local stats; Settings → Session history for full export)\n\n${table}`
  )
}
