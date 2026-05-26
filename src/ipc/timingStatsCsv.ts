import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime } from './isTauri'
import {
  exportThinkingStatsCsv,
  formatTurnTimingCsvRow,
  timingStatsCsvHeaderLine,
  type ThinkingStatsStore,
  type TurnTimingRecord,
} from '../utils/thinkingStats'

/** Write full history CSV to workspace (overwrite). Desktop only. */
export async function writeTimingStatsCsvFile(
  workingDir: string,
  filePath: string,
  store: ThinkingStatsStore,
  filterModel: string | null
): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error('CSV file export requires the desktop app')
  }
  const trimmed = filePath.trim()
  if (!trimmed) throw new Error('Enter a CSV file path')
  const content = exportThinkingStatsCsv(store, filterModel)
  await invoke('write_timing_stats_csv', {
    workingDir: workingDir || '.',
    filePath: trimmed,
    content,
    append: false,
  })
}

/** Append one turn row; writes header when the file is missing or empty. */
export async function appendTimingStatsCsvRow(
  workingDir: string,
  filePath: string,
  record: TurnTimingRecord
): Promise<void> {
  if (!isTauriRuntime()) return
  const trimmed = filePath.trim()
  if (!trimmed) return
  await invoke('write_timing_stats_csv', {
    workingDir: workingDir || '.',
    filePath: trimmed,
    content: `${formatTurnTimingCsvRow(record)}\n`,
    append: true,
    headerLine: timingStatsCsvHeaderLine(),
  })
}

/** Trigger browser download of full history CSV. */
export function downloadThinkingStatsCsv(
  store: ThinkingStatsStore,
  filterModel: string | null
): void {
  const csv = exportThinkingStatsCsv(store, filterModel)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `bright-vision-timing-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
