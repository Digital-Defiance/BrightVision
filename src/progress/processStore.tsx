import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react'
import type { CoreEventBase } from '../ipc/events'
import {
  IDLE_SNAPSHOT,
  PHASE_LABELS,
  type ProcessPhase,
  type ProcessSnapshot,
  type ProcessUpdate,
} from './types'

type Action =
  | { type: 'apply'; update: ProcessUpdate }
  | { type: 'idle' }
  | { type: 'fail'; message: string }

function reducer(state: ProcessSnapshot, action: Action): ProcessSnapshot {
  switch (action.type) {
    case 'idle':
      return IDLE_SNAPSHOT
    case 'fail':
      return {
        active: true,
        phase: 'error',
        label: PHASE_LABELS.error,
        detail: action.message,
        progress: null,
        error: action.message,
      }
    case 'apply': {
      const { update } = action
      const phase = update.phase
      if (phase === 'idle') return IDLE_SNAPSHOT
      return {
        active: true,
        phase,
        label: update.label || PHASE_LABELS[phase],
        detail: update.detail,
        progress: update.progress === undefined ? null : update.progress,
        error: update.error,
      }
    }
    default:
      return state
  }
}

export interface ProcessController {
  snapshot: ProcessSnapshot
  apply: (update: ProcessUpdate) => void
  begin: (phase: ProcessPhase, label?: string, detail?: string, progress?: number | null) => void
  idle: () => void
  fail: (message: string) => void
  ingestCoreEvent: (ev: CoreEventBase) => void
}

const ProcessContext = createContext<ProcessController | null>(null)

export function ProcessProvider({ children }: { children: ReactNode }) {
  const [snapshot, dispatch] = useReducer(reducer, IDLE_SNAPSHOT)

  const apply = useCallback((update: ProcessUpdate) => {
    dispatch({ type: 'apply', update })
  }, [])

  const begin = useCallback(
    (phase: ProcessPhase, label?: string, detail?: string, progress: number | null = null) => {
      dispatch({
        type: 'apply',
        update: {
          phase,
          label: label ?? PHASE_LABELS[phase],
          detail,
          progress,
        },
      })
    },
    []
  )

  const idle = useCallback(() => dispatch({ type: 'idle' }), [])
  const fail = useCallback((message: string) => dispatch({ type: 'fail', message }), [])

  const ingestCoreEvent = useCallback((ev: CoreEventBase) => {
    switch (ev.type) {
      case 'token':
        dispatch({
          type: 'apply',
          update: { phase: 'reasoning', label: PHASE_LABELS.reasoning, progress: null },
        })
        break
      case 'tool_output':
      case 'tool_error':
      case 'tool_warning':
        dispatch({
          type: 'apply',
          update: {
            phase: 'tool',
            label: PHASE_LABELS.tool,
            detail: String(ev.type).replace('tool_', ''),
            progress: null,
          },
        })
        break
      case 'confirm': {
        const auto = Boolean((ev as { auto_answered?: boolean }).auto_answered)
        if (!auto) {
          dispatch({
            type: 'apply',
            update: {
              phase: 'confirm',
              label: PHASE_LABELS.confirm,
              detail: String(ev.question ?? '').slice(0, 120),
              progress: null,
            },
          })
        }
        break
      }
      case 'done':
        if (ev.commit_hash) {
          dispatch({
            type: 'apply',
            update: {
              phase: 'commit',
              label: PHASE_LABELS.commit,
              detail: String(ev.commit_message ?? '').slice(0, 80),
              progress: 1,
            },
          })
          window.setTimeout(() => dispatch({ type: 'idle' }), 600)
        } else {
          dispatch({ type: 'idle' })
        }
        break
      case 'error':
        dispatch({
          type: 'fail',
          message: String(ev.text ?? 'Unknown error'),
        })
        window.setTimeout(() => dispatch({ type: 'idle' }), 4000)
        break
      default:
        break
    }
  }, [])

  const value = useMemo<ProcessController>(
    () => ({ snapshot, apply, begin, idle, fail, ingestCoreEvent }),
    [snapshot, apply, begin, idle, fail, ingestCoreEvent]
  )

  return <ProcessContext.Provider value={value}>{children}</ProcessContext.Provider>
}

export function useProcess(): ProcessController {
  const ctx = useContext(ProcessContext)
  if (!ctx) throw new Error('useProcess must be used within ProcessProvider')
  return ctx
}
