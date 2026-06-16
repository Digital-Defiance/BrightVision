import { describe, expect, it } from 'vitest'
import { PytestSubstepTracker } from './pytestSubstepTracker'
import { shortSubstepLabel, substepDisplayLines } from './substepDisplay'

describe('shortSubstepLabel', () => {
  it('shortens pytest node ids', () => {
    expect(
      shortSubstepLabel(
        'tests/core/test_hello_llm.py::TestHelloLlm::test_hello_message_streams_tokens_and_done'
      )
    ).toBe('test_hello_llm::test_hello_message_streams_tokens_and_done')
  })
})

describe('substepDisplayLines', () => {
  it('shows last done and current running with timestamps', () => {
    const started = Date.parse('2026-06-16T10:19:00')
    const ended = Date.parse('2026-06-16T10:19:20')
    const lines = substepDisplayLines(
      {
        stepId: 'llm:core',
        manifest: ['a', 'b'],
        completed: [
          {
            id: 'tests/core/test_hello_llm.py::TestHelloLlm::test_hello',
            durationSeconds: 20,
            startedAtMs: started,
            completedAtMs: ended,
          },
        ],
        runningId: 'tests/core/test_edit_block_llm.py::TestEditBlockLlm::test_add',
        runningStartedAtMs: ended + 1000,
        runningElapsedSeconds: 5,
        playwrightIndex: 0,
        playwrightTotal: 0,
      },
      false,
      ended + 6000
    )
    expect(lines?.lastDone?.label).toContain('test_hello_llm')
    expect(lines?.lastDone?.endedAt).toMatch(/20/)
    expect(lines?.running?.label).toContain('test_edit_block')
    expect(lines?.running?.progress).toBe('2/2 tests')
    expect(lines?.running?.elapsed).toBeTruthy()
  })
})

describe('PytestSubstepTracker timestamps', () => {
  it('records start and completion times on PASS', () => {
    const tracker = new PytestSubstepTracker()
    tracker.resetForStep('llm:core')
    const t0 = Date.now()
    tracker.feed(
      'START tests/core/test_hello_llm.py::TestHelloLlm::test_hello_message_streams_tokens_and_done'
    )
    tracker.feed(
      'PASSED tests/core/test_hello_llm.py::TestHelloLlm::test_hello_message_streams_tokens_and_done (19.0s)'
    )
    const snap = tracker.snapshot(t0 + 20_000)!
    expect(snap.completed[0]?.durationSeconds).toBe(19)
    expect(snap.completed[0]?.startedAtMs).toBeGreaterThan(0)
    expect(snap.completed[0]?.completedAtMs).toBeGreaterThanOrEqual(snap.completed[0]!.startedAtMs)
    expect(snap.runningStartedAtMs).toBeNull()
  })
})
