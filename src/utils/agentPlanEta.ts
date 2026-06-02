import { parseImplementationSteps } from '../todos/tasksMd'
import {
  buildTimingStatsView,
  type ThinkingStatsStore,
} from './thinkingStats'
import { formatDurationMs } from './thinkingTiming'
import type { TurnEtaEstimate } from './turnEtaEstimate'

export interface AgentPlanEtaInput {
  tasksMd: string
  model: string
  statsStore: ThinkingStatsStore
  brightDate?: boolean
}

/**
 * When the agent has started a numbered task list, estimate remaining work from
 * pending steps × (median turn time / typical steps per plan).
 */
export function estimateAgentPlanEta(input: AgentPlanEtaInput): TurnEtaEstimate | null {
  const steps = parseImplementationSteps(input.tasksMd)
  if (steps.length < 2) return null
  const done = steps.filter((s) => s.done).length
  const pending = steps.length - done
  if (pending <= 0 || done <= 0) return null

  const view = buildTimingStatsView(input.statsStore, input.model.trim() || 'unknown')
  if (view.response.count < 2) return null

  const fmt = (ms: number) => formatDurationMs(ms, { brightDate: input.brightDate })
  const perStep = view.response.median / Math.max(1, steps.length)
  const remainingMs = Math.round(pending * perStep)
  const totalMs = Math.round(steps.length * perStep)

  return {
    remainingMs,
    totalMs,
    shortLabel: `~${fmt(remainingMs)} plan*`,
    tooltip: [
      `Agent task plan: ${done}/${steps.length} steps done, ${pending} remaining.`,
      `~${fmt(perStep)} per step (from ${view.response.count} turns, median ${fmt(view.response.median)}).`,
      'Blended with turn ETA when both are shown.',
    ].join('\n'),
    confidence: view.response.count >= 5 ? 'medium' : 'low',
  }
}

/** Prefer the longer remaining estimate; merge tooltips when both exist. */
export function mergeTurnAndPlanEta(
  turn: TurnEtaEstimate | null,
  plan: TurnEtaEstimate | null,
  brightDate?: boolean
): TurnEtaEstimate | null {
  if (!turn && !plan) return null
  if (!plan) return turn
  if (!turn) return plan

  const turnRem = turn.remainingMs ?? 0
  const planRem = plan.remainingMs ?? 0
  const usePlan = planRem > turnRem && planRem > 0
  const primary = usePlan ? plan : turn
  const secondary = usePlan ? turn : plan

  const remainingMs = Math.max(turnRem, planRem) || null
  const fmt = (ms: number) => formatDurationMs(ms, { brightDate })
  const tooltip = [primary.tooltip, '---', secondary.tooltip].join('\n')

  return {
    remainingMs,
    totalMs: Math.max(turn.totalMs ?? 0, plan.totalMs ?? 0) || null,
    shortLabel:
      remainingMs != null && remainingMs > 0 ? `~${fmt(remainingMs)} left*` : primary.shortLabel,
    tooltip,
    confidence:
      primary.confidence === 'high' || secondary.confidence === 'high'
        ? 'high'
        : primary.confidence === 'medium' || secondary.confidence === 'medium'
          ? 'medium'
          : 'low',
  }
}
