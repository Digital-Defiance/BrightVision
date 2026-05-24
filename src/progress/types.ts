/**
 * UI process model — maps boot, API, and core SSE phases to React state.
 * Not tied to MUI; consumed by VisionActivityBar and hooks.
 */

export type ProcessPhase =
  | 'idle'
  | 'booting_api'
  | 'connecting'
  | 'session'
  | 'reasoning'
  | 'tool'
  | 'confirm'
  | 'commit'
  | 'stopping'
  | 'error'

export interface ProcessSnapshot {
  /** When false, the activity rail is hidden (except brief error flash). */
  active: boolean
  phase: ProcessPhase
  /** Primary line under the pulse (e.g. "Thinking"). */
  label: string
  /** Secondary line (tool name, file count, etc.). */
  detail?: string
  /** 0–1 finite progress, or null for indeterminate flow. */
  progress: number | null
  /** Shown on error phase; cleared when returning to idle. */
  error?: string
}

export interface ProcessUpdate {
  phase: ProcessPhase
  label: string
  detail?: string
  progress?: number | null
  error?: string
}

export const IDLE_SNAPSHOT: ProcessSnapshot = {
  active: false,
  phase: 'idle',
  label: '',
  progress: null,
}

export const PHASE_LABELS: Record<ProcessPhase, string> = {
  idle: 'Ready',
  booting_api: 'Starting engine',
  connecting: 'Connecting',
  session: 'Opening workspace',
  reasoning: 'Thinking',
  tool: 'Running tools',
  confirm: 'Waiting for you',
  commit: 'Committing',
  stopping: 'Shutting down',
  error: 'Something went wrong',
}
