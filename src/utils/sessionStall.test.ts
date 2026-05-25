import { describe, expect, it } from 'vitest'
import { buildTurnActivity, isLikelyStalled, turnActivityHint } from './sessionStall'

describe('sessionStall', () => {
  it('detects streaming when tokens are recent', () => {
    const now = 100_000
    const a = buildTurnActivity(true, now - 1000, now - 500, 'Waiting for ollama', now)
    expect(a.kind).toBe('streaming')
    expect(isLikelyStalled(a)).toBe(false)
  })

  it('detects post-answer wait when tokens stopped but progress still waiting', () => {
    const now = 100_000
    const a = buildTurnActivity(true, now - 20_000, now - 15_000, 'Waiting for ollama', now)
    expect(a.kind).toBe('post_answer_wait')
    expect(turnActivityHint(a, 9)).toContain('Answer is visible')
  })

  it('treats preparing workspace progress as waiting_model', () => {
    const now = 100_000
    const a = buildTurnActivity(true, now - 120_000, null, 'Preparing workspace (24s)', now)
    expect(a.kind).toBe('waiting_model')
    expect(isLikelyStalled(a)).toBe(false)
  })

  it('does not flag stall while waiting for the model with recent progress', () => {
    const now = 100_000
    const a = buildTurnActivity(
      true,
      now - 60_000,
      null,
      'Waiting for Ollama (16s)',
      now
    )
    expect(a.kind).toBe('waiting_model')
    expect(isLikelyStalled(a)).toBe(false)
  })

  it('flags stall only after several minutes without progress', () => {
    const now = 100_000
    const a = buildTurnActivity(true, now - 60_000, now - 55_000, 'Scanning repo map', now)
    expect(isLikelyStalled(a)).toBe(false)
    const stalled = buildTurnActivity(true, now - 400_000, now - 395_000, '', now)
    expect(isLikelyStalled(stalled)).toBe(true)
    expect(turnActivityHint(stalled, 9)).toContain('Clear the queue')
    expect(turnActivityHint(stalled, 9)).toContain('stuck')
  })
})
