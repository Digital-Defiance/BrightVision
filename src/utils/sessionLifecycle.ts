import type { ProcessPhase, ProcessSnapshot } from '../progress/types'

/** Phases where start/stop is in flight (activity bar may show progress). */
export const LIFECYCLE_PHASES: readonly ProcessPhase[] = [
  'booting_api',
  'connecting',
  'session',
  'stopping',
]

export function isLifecyclePhase(phase: ProcessPhase): boolean {
  return (LIFECYCLE_PHASES as readonly string[]).includes(phase)
}

export function isSessionLifecycleActive(
  process: ProcessSnapshot,
  isRunning: boolean,
  isStarting: boolean
): boolean {
  return (
    isRunning ||
    isStarting ||
    (process.active && isLifecyclePhase(process.phase))
  )
}
