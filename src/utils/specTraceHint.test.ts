import { describe, expect, it } from 'vitest'
import { buildSpecTraceHint } from './specTraceHint'
import type { TraceabilityResult } from '../todos/earsTypes'

function trace(partial: Partial<TraceabilityResult>): TraceabilityResult {
  return {
    ok: true,
    error_count: 0,
    warning_count: 0,
    req_ids: ['REQ-001'],
    links: [{ req_id: 'REQ-001', in_design: true, task_steps: [1] }],
    steps: [],
    design_headings: [],
    issues: [],
    ...partial,
  }
}

describe('buildSpecTraceHint', () => {
  it('returns null when trace is clean', () => {
    expect(buildSpecTraceHint(trace({ ok: true }))).toBeNull()
  })

  it('builds refine prompt from trace issues', () => {
    const hint = buildSpecTraceHint(
      trace({
        ok: false,
        error_count: 1,
        issues: [
          {
            code: 'TRACE_UNCOVERED',
            message: 'REQ-002 not referenced in design',
            severity: 'error',
            req_id: 'REQ-002',
          },
        ],
        links: [{ req_id: 'REQ-002', in_design: false, task_steps: [] }],
      })
    )
    expect(hint).not.toBeNull()
    expect(hint!.refinePrompt).toContain('REQ-002')
    expect(hint!.refinePrompt).toContain('Fix spec trace gaps')
    expect(hint!.summary).toContain('1 trace error')
  })
})
