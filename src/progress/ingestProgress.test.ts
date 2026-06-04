import { describe, expect, it } from 'vitest'
import {
  isAgentPreprocHeartbeatProgress,
  isWaitingForModelProgress,
  phaseForProgressLabel,
  progressEventToUpdate,
  progressFraction,
  shouldHoldPostTokenProgress,
} from './ingestProgress'

describe('progressFraction', () => {
  it('uses fraction when provided', () => {
    expect(progressFraction({ type: 'progress', fraction: 0.42 })).toBe(0.42)
  })

  it('derives from current and total', () => {
    expect(progressFraction({ type: 'progress', current: 25, total: 100 })).toBe(0.25)
  })
})

describe('progressEventToUpdate', () => {
  it('maps repo scan to determinate scan phase', () => {
    const u = progressEventToUpdate({
      type: 'progress',
      label: 'Scanning repo',
      current: 10,
      total: 200,
    })
    expect(u.phase).toBe('scan')
    expect(u.progress).toBeCloseTo(0.05)
    expect(u.current).toBe(10)
    expect(u.total).toBe(200)
  })

  it('detects waiting-for-model progress updates', () => {
    const u = progressEventToUpdate({
      type: 'progress',
      label: 'Waiting for ollama_chat/foo',
      message: 'Waiting for ollama_chat/foo',
    })
    expect(isWaitingForModelProgress(u)).toBe(true)
  })

  it('maps waiting spinner to reasoning without fraction', () => {
    const u = progressEventToUpdate({
      type: 'progress',
      label: 'Waiting for gpt-4',
      message: 'Waiting for gpt-4',
    })
    expect(u.phase).toBe('reasoning')
    expect(u.label).toBe('Waiting for model')
    expect(u.progress).toBeNull()
  })
})

describe('phaseForProgressLabel', () => {
  it('detects repo map work', () => {
    expect(phaseForProgressLabel('Updating repo map', '')).toBe('scan')
  })
})

describe('post-token progress hold', () => {
  it('detects agent slash preproc heartbeats', () => {
    const u = progressEventToUpdate({
      type: 'progress',
      label: 'Vision',
      message: 'Running slash commands (176s)',
    })
    expect(isAgentPreprocHeartbeatProgress(u)).toBe(true)
    expect(shouldHoldPostTokenProgress(u)).toBe(true)
  })
})
