import { describe, expect, it, vi, afterEach } from 'vitest'
import { RunProgressTracker } from './runProgress'

describe('RunProgressTracker server timing', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('extrapolates sub-step elapsed from progress heartbeats after replay', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-16T10:00:00Z'))

    const tracker = new RunProgressTracker()
    tracker.initPlan([{ id: 'llm:core', label: 'LLM core', requiresOllama: true, touchesCorePort: false }])
    tracker.apply({ type: 'run_started' })
    tracker.apply({ type: 'step_started', stepId: 'llm:core' })
    tracker.apply({
      type: 'step_line',
      stepId: 'llm:core',
      stream: 'stderr',
      line: 'START tests/core/test_a.py::TestA::test_one',
    })
    tracker.apply({
      type: 'step_line',
      stepId: 'llm:core',
      stream: 'stderr',
      line: 'PASSED tests/core/test_a.py::TestA::test_one (25.0s)',
    })
    tracker.apply({
      type: 'step_line',
      stepId: 'llm:core',
      stream: 'stderr',
      line: 'START tests/core/test_b.py::TestB::test_two',
    })
    tracker.apply({
      type: 'progress',
      stepIndex: 1,
      totalSteps: 1,
      elapsedSeconds: 60,
      stepElapsedSeconds: 40,
    })

    let snap = tracker.snapshot()
    expect(snap.substep?.runningElapsedSeconds).toBeCloseTo(15, 0)

    vi.advanceTimersByTime(5000)
    snap = tracker.snapshot()
    expect(snap.substep?.runningElapsedSeconds).toBeCloseTo(20, 0)
    expect(snap.progress.elapsed).toBeCloseTo(65, 0)
  })
})
