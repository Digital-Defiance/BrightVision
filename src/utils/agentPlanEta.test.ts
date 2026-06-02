import { describe, expect, it } from 'vitest'
import { estimateAgentPlanEta, mergeTurnAndPlanEta } from './agentPlanEta'
import { estimateTurnEta } from './turnEtaEstimate'
import { recordTurnTiming, type ThinkingStatsStore } from './thinkingStats'

describe('agentPlanEta', () => {
  it('estimates from pending implementation steps', () => {
    let store: ThinkingStatsStore = { version: 2, history: [] }
    for (let i = 0; i < 4; i++) {
      store = recordTurnTiming(store, 'ollama_chat/test', {
        responseMs: 120_000,
        thinkMs: 10_000,
        promptChars: 100,
      })
    }
    const eta = estimateAgentPlanEta({
      tasksMd: `- [x] 1. First\n- [ ] 2. Second\n- [ ] 3. Third`,
      model: 'ollama_chat/test',
      statsStore: store,
    })
    expect(eta?.remainingMs).toBeGreaterThan(0)
    expect(eta?.shortLabel).toContain('plan')
  })

  it('merges with turn ETA using longer remaining', () => {
    const turn = estimateTurnEta({
      model: 'm',
      promptChars: 100,
      elapsedMs: 1000,
      statsStore: { version: 2, history: [] },
    })
    const plan = {
      remainingMs: 600_000,
      totalMs: 900_000,
      shortLabel: '~plan',
      tooltip: 'plan',
      confidence: 'low' as const,
    }
    const merged = mergeTurnAndPlanEta(turn, plan, false)
    expect(merged?.remainingMs).toBe(600_000)
  })
})
