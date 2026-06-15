import { describe, expect, it } from 'vitest'
import {
  firstOpenImplementationStep,
  mergedImplementationSteps,
  parseImplementationSteps,
} from './tasksMd'

describe('parseImplementationSteps', () => {
  it('parses dotted step numbers', () => {
    const steps = parseImplementationSteps(
      '- [x] 1.1 Wire API (depends: none)\n- [ ] 1.2 Add tests (depends: 1.1)\n'
    )
    expect(steps).toHaveLength(2)
    expect(steps[0]?.number).toBe('1.1')
    expect(steps[0]?.done).toBe(true)
    expect(steps[1]?.number).toBe('1.2')
  })
})

describe('mergedImplementationSteps', () => {
  it('prefers checklist done state over stale tasks_md', () => {
    const steps = mergedImplementationSteps(
      '- [ ] 1.1 First\n- [ ] 1.2 Second\n',
      [
        { text: '1.1 First', done: true },
        { text: '1.2 Second', done: false },
      ]
    )
    expect(steps[0]?.done).toBe(true)
    expect(steps[1]?.done).toBe(false)
  })

  it('falls back to tasks_md when checklist has no numbered rows', () => {
    const steps = mergedImplementationSteps('- [ ] 1. Scaffold\n', [{ text: 'Generic item', done: false }])
    expect(steps).toHaveLength(1)
    expect(steps[0]?.number).toBe('1')
  })
})

describe('firstOpenImplementationStep', () => {
  it('returns first incomplete step', () => {
    const open = firstOpenImplementationStep([
      { number: '1', text: 'A', done: true },
      { number: '2', text: 'B', done: false },
    ])
    expect(open?.number).toBe('2')
  })
})
