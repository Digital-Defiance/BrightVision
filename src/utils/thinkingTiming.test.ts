import { describe, expect, it } from 'vitest'
import {
  buildLiveThinkingState,
  computeLiveThoughtMs,
  createTurnTimingTracker,
  finalizeTurnTiming,
  formatDurationMs,
  sectionDurationByIndex,
  syncTurnTimingFromContent,
} from './thinkingTiming'
import { splitAssistantSections } from './chatStream'

describe('thinkingTiming', () => {
  it('formats durations', () => {
    expect(formatDurationMs(450)).toBe('450ms')
    expect(formatDurationMs(2500)).toBe('2.5s')
  })

  it('response time runs from turn start; think time only in thought sections', () => {
    let t = createTurnTimingTracker(100, 1000)
    expect(buildLiveThinkingState(t, 6000).responseElapsedMs).toBe(5000)
    expect(computeLiveThoughtMs(t, 6000)).toBe(0)
    t = syncTurnTimingFromContent(t, '► **THINKING**\nplan\n', 3000)
    expect(computeLiveThoughtMs(t, 6000)).toBe(3000)
    t = syncTurnTimingFromContent(t, '► **THINKING**\nplan\n► **ANSWER**\nok\n', 7000)
    expect(computeLiveThoughtMs(t, 9000)).toBe(4000)
    const waiting = buildLiveThinkingState(createTurnTimingTracker(50, 2000), 5500)
    expect(waiting.responseElapsedMs).toBe(3500)
    expect(waiting.thoughtElapsedMs).toBe(0)
    expect(waiting.phaseLabel).toBe('Waiting for model')
  })

  it('tracks section transitions', () => {
    let t = createTurnTimingTracker(120, 0)
    t = syncTurnTimingFromContent(t, '► **THINKING**\nplan\n', 1000)
    t = syncTurnTimingFromContent(t, '► **THINKING**\nplan\n► **ANSWER**\nok\n', 5000)
    const result = finalizeTurnTiming(t, '► **THINKING**\nplan\n► **ANSWER**\nok\n', 8000)
    expect(result.userPromptChars).toBe(120)
    expect(result.sections.map((s) => s.kind)).toEqual(['thinking', 'answer'])
    expect(result.sections[0].durationMs).toBe(4000)
    expect(result.sections[1].durationMs).toBe(3000)
    expect(result.thoughtMs).toBe(4000)
    expect(result.turnDurationMs).toBe(8000)
  })

  it('zips section durations onto split sections', () => {
    const content = '► **THINKING**\na\n► **ANSWER**\nb'
    const sections = splitAssistantSections(content)
    const durations = [
      { kind: 'thinking' as const, durationMs: 1000 },
      { kind: 'answer' as const, durationMs: 500 },
    ]
    const map = sectionDurationByIndex(sections, durations)
    expect(map.get(0)).toBe(1000)
    expect(map.get(1)).toBe(500)
  })
})
