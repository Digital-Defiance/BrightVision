import { describe, expect, it } from 'vitest'
import { emptyThinkingStatsStore, recordTurnTiming } from './thinkingStats'
import {
  estimateTurnEta,
  etaCompletionFraction,
  isTurnEtaVisible,
  monotonicEtaCompletionPercent,
} from './turnEtaEstimate'

describe('estimateTurnEta', () => {
  it('returns none without history', () => {
    const eta = estimateTurnEta({
      model: 'ollama_chat/llama3',
      promptChars: 100,
      elapsedMs: 5000,
      statsStore: emptyThinkingStatsStore(),
    })
    expect(eta.confidence).toBe('none')
    expect(eta.shortLabel).toBeNull()
  })

  it('estimates remaining from median history', () => {
    let store = emptyThinkingStatsStore()
    for (let i = 0; i < 5; i++) {
      store = recordTurnTiming(store, 'm1', {
        responseMs: 60_000,
        thinkMs: 10_000,
        promptChars: 200,
        tokensReceived: 400,
        tokensSent: 1000,
      })
    }
    const eta = estimateTurnEta({
      model: 'm1',
      promptChars: 200,
      elapsedMs: 20_000,
      statsStore: store,
    })
    expect(eta.confidence).toBe('medium')
    expect(eta.remainingMs).toBeGreaterThan(30_000)
    expect(eta.shortLabel).toMatch(/left/)
  })

  it('etaCompletionFraction tracks elapsed vs estimated total', () => {
    const eta = estimateTurnEta({
      model: 'm1',
      promptChars: 200,
      elapsedMs: 30_000,
      statsStore: (() => {
        let store = emptyThinkingStatsStore()
        for (let i = 0; i < 5; i++) {
          store = recordTurnTiming(store, 'm1', {
            responseMs: 60_000,
            thinkMs: 10_000,
            promptChars: 200,
            tokensReceived: 400,
            tokensSent: 1000,
          })
        }
        return store
      })(),
    })
    expect(isTurnEtaVisible(eta)).toBe(true)
    const fraction = etaCompletionFraction(eta, 30_000)
    expect(fraction).not.toBeNull()
    expect(fraction!).toBeGreaterThan(0.4)
    expect(fraction!).toBeLessThanOrEqual(0.98)
  })

  it('monotonicEtaCompletionPercent never decreases', () => {
    const first = monotonicEtaCompletionPercent(0, 0.4)
    const second = monotonicEtaCompletionPercent(first.maxFraction, 0.25)
    expect(second.percent).toBe(40)
    const third = monotonicEtaCompletionPercent(second.maxFraction, 0.55)
    expect(third.percent).toBe(55)
  })

  it('extends totalMs when turn exceeds median so bar matches left label', () => {
    let store = emptyThinkingStatsStore()
    for (let i = 0; i < 8; i++) {
      store = recordTurnTiming(store, 'm1', {
        responseMs: 60_000,
        thinkMs: 5_000,
        promptChars: 200,
        tokensReceived: 400,
        tokensSent: 1000,
      })
    }
  store = recordTurnTiming(store, 'm1', {
      responseMs: 300_000,
      thinkMs: 5_000,
      promptChars: 200,
      tokensReceived: 400,
      tokensSent: 1000,
    })
    const elapsed = 96_000
    const eta = estimateTurnEta({
      model: 'm1',
      promptChars: 200,
      elapsedMs: elapsed,
      statsStore: store,
    })
    expect(eta.remainingMs).toBeGreaterThan(60_000)
    expect(eta.totalMs).toBeGreaterThanOrEqual(elapsed + (eta.remainingMs ?? 0) - 1000)
    const fraction = etaCompletionFraction(eta, elapsed)
    expect(fraction).not.toBeNull()
    expect(fraction!).toBeLessThan(0.75)
    expect(fraction!).toBeGreaterThan(0.1)
  })
})
