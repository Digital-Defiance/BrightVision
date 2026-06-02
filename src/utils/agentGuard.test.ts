import { describe, expect, it } from 'vitest'
import {
  checkAgentLimits,
  parseMaxAgentTimeMs,
  parsePositiveInt,
  parseShutdownDeadlineMs,
} from './agentGuard'
import { DEFAULT_AGENT_GUARD_PREFS } from '../theme/agentGuardPrefs'

describe('agentGuard', () => {
  it('parses conventional max time', () => {
    expect(parseMaxAgentTimeMs('5', 'min', false)).toBe(300_000)
  })

  it('parses BrightDate max time in md', () => {
    expect(parseMaxAgentTimeMs('10', 'md', true)).toBe(864_000)
  })

  it('blocks when turn cap reached', () => {
    expect(
      checkAgentLimits({
        prefs: { ...DEFAULT_AGENT_GUARD_PREFS, maxAgentTurns: '3' },
        brightDate: false,
        completedAgentTurns: 3,
        agentPhaseMs: 0,
      })
    ).toBe('max_turns')
  })

  it('parses future datetime-local shutdown', () => {
    const future = new Date(Date.now() + 3600_000).toISOString().slice(0, 16)
    const ms = parseShutdownDeadlineMs(future, false)
    expect(ms).not.toBeNull()
    expect(ms!).toBeGreaterThan(Date.now())
  })

  it('rejects empty max turns', () => {
    expect(parsePositiveInt('')).toBeNull()
    expect(parsePositiveInt('0')).toBeNull()
  })
})
