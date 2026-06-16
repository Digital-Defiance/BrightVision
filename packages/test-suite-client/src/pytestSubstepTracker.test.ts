import { describe, expect, it } from 'vitest'
import { PytestSubstepTracker, parseMarkerDurationSeconds } from './pytestSubstepTracker'
import { LLM_CORE_PYTEST_SUBSTEPS } from './substepManifest'

describe('parseMarkerDurationSeconds', () => {
  it('parses pytest duration suffix', () => {
    expect(
      parseMarkerDurationSeconds(
        'PASSED tests/core/test_hello_llm.py::TestHelloLlm::test_hello (20.5s)'
      )
    ).toBe(20.5)
  })
})

describe('PytestSubstepTracker', () => {
  it('tracks pytest START and PASSED in order for llm:core', () => {
    const tracker = new PytestSubstepTracker()
    tracker.resetForStep('llm:core')
    tracker.feed(
      'START tests/core/test_hello_llm.py::TestHelloLlm::test_hello_message_streams_tokens_and_done'
    )
    let snap = tracker.snapshot()!
    expect(snap.runningId).toContain('test_hello_llm.py')
    expect(snap.completed).toHaveLength(0)

    tracker.feed(
      'PASSED tests/core/test_hello_llm.py::TestHelloLlm::test_hello_message_streams_tokens_and_done (19.0s)'
    )
    snap = tracker.snapshot()!
    expect(snap.completed).toHaveLength(1)
    expect(snap.completed[0]?.durationSeconds).toBe(19)
    expect(snap.completed[0]?.completedAtMs).toBeGreaterThan(0)
    expect(snap.runningStartedAtMs).toBeNull()
  })

  it('derives running elapsed from server step elapsed minus completed durations', () => {
    const tracker = new PytestSubstepTracker()
    tracker.resetForStep('llm:core')
    tracker.feed('START tests/core/test_a.py::TestA::test_one')
    tracker.feed('PASSED tests/core/test_a.py::TestA::test_one (30.0s)')
    tracker.feed('START tests/core/test_b.py::TestB::test_two')
    const snap = tracker.snapshot(Date.now(), 47)!
    expect(snap.runningId).toContain('test_b')
    expect(snap.runningElapsedSeconds).toBeCloseTo(17, 0)
  })

  it('records Playwright [N/total] progress for e2e:llm', () => {
    const tracker = new PytestSubstepTracker()
    tracker.resetForStep('e2e:llm')
    tracker.notePlaywrightProgress(2, 8)
    const snap = tracker.snapshot()!
    expect(snap.playwrightIndex).toBe(2)
    expect(snap.playwrightTotal).toBe(8)
  })

  it('tracks vitest and playwright list output for release-style steps', () => {
    const tracker = new PytestSubstepTracker()
    tracker.resetForStep('test-local:release')
    tracker.feed(' ✓ src/utils/specLayers.test.ts (8 tests) 3ms')
    let snap = tracker.snapshot()!
    expect(snap.completed).toHaveLength(1)
    expect(snap.completed[0]?.id).toContain('specLayers.test.ts')

    tracker.feed('Running 136 tests using 1 worker')
    tracker.feed(
      '  ✓    1 e2e/about-dialog.spec.ts:5:3 › About dialog › logo opens about with publisher and Cecli credit (692ms)'
    )
    snap = tracker.snapshot()!
    expect(snap.playwrightTotal).toBe(136)
    expect(snap.playwrightIndex).toBe(1)
    expect(snap.runningId).toBe('test 2/136')
  })
})
