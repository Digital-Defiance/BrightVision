import { describe, expect, it } from 'vitest'
import {
  buildModelTimingStats,
  buildTimingStatsView,
  clearModelThinkingStats,
  computeTimingDistribution,
  emptyThinkingStatsStore,
  parseThinkingStatsStore,
  recordTurnTiming,
  thinkShare,
} from './thinkingStats'

describe('thinkingStats', () => {
  it('computes distribution stats', () => {
    const d = computeTimingDistribution([1000, 2000, 3000, 4000, 10000])
    expect(d.count).toBe(5)
    expect(d.min).toBe(1000)
    expect(d.max).toBe(10000)
    expect(d.mean).toBe(4000)
    expect(d.median).toBe(3000)
    expect(d.p90).toBe(10000)
  })

  it('records turns and builds per-model view', () => {
    let store = emptyThinkingStatsStore()
    store = recordTurnTiming(store, 'm1', { responseMs: 5000, thinkMs: 2000, promptChars: 100 })
    store = recordTurnTiming(store, 'm1', { responseMs: 8000, thinkMs: 3000, promptChars: 200 })
    store = recordTurnTiming(store, 'm2', { responseMs: 3000, thinkMs: 0, promptChars: 50 })

    const all = buildTimingStatsView(store, null)
    expect(all.totalTurns).toBe(3)
    expect(all.modelsUsed).toBe(2)
    expect(all.response.mean).toBeCloseTo((5000 + 8000 + 3000) / 3)

    const m1 = buildTimingStatsView(store, 'm1')
    expect(m1.totalTurns).toBe(2)
    expect(m1.history[0].responseMs).toBe(8000)

    const stats = buildModelTimingStats(store.history.filter((r) => r.model === 'm1'))
    expect(stats?.turns).toBe(2)
    expect(stats?.avgThinkShare).toBeGreaterThan(0)
  })

  it('think share is capped at 100%', () => {
    const row = {
      responseMs: 1000,
      thinkMs: 500,
      promptChars: 0,
      at: '',
      id: '',
      model: '',
    }
    expect(thinkShare(row)).toBe(0.5)
  })

  it('clears per model', () => {
    let store = recordTurnTiming(emptyThinkingStatsStore(), 'a', {
      responseMs: 1,
      thinkMs: 0,
      promptChars: 0,
    })
    store = recordTurnTiming(store, 'b', { responseMs: 2, thinkMs: 0, promptChars: 0 })
    store = clearModelThinkingStats(store, 'a')
    expect(store.history).toHaveLength(1)
    expect(store.history[0].model).toBe('b')
  })

  it('migrates v1 JSON to v2 history', () => {
    const store = parseThinkingStatsStore({
      version: 1,
      byModel: {
        'test/model': {
          sampleCount: 1,
          totalThoughtMs: 100,
          totalPromptChars: 10,
          recent: [
            {
              at: '2020-01-01T00:00:00.000Z',
              thoughtMs: 100,
              promptChars: 10,
              turnMs: 200,
            },
          ],
        },
      },
    })
    expect(store.version).toBe(2)
    expect(store.history).toHaveLength(1)
    expect(store.history[0].responseMs).toBe(200)
    expect(store.history[0].thinkMs).toBe(100)
  })
})
