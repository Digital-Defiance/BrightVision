import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  corpusExpectsParse,
  formatTestMarkerChip,
  parseTestMarkerLine,
  PlaywrightLineTracker,
  shouldShowLiveTestMarker,
  shouldUpdateLatestTestMarker,
} from './testProgressParser'

describe('parseTestMarkerLine', () => {
  it('parses dogfood PASS:', () => {
    const m = parseTestMarkerLine('PASS: brightdate J2000 epoch')
    expect(m?.outcome).toBe('pass')
    expect(formatTestMarkerChip(m!)).toBe('(PASS) brightdate J2000 epoch')
  })

  it('parses dogfood PASS without colon', () => {
    const m = parseTestMarkerLine('PASS context-workspace (standalone git repo)')
    expect(m?.outcome).toBe('pass')
    expect(m?.label).toContain('context-workspace')
  })

  it('parses step SUCCESS bracket', () => {
    const m = parseTestMarkerLine('[ SUCCESS ] yarn dogfood:check')
    expect(m?.outcome).toBe('pass')
    expect(m?.label).toBe('yarn dogfood:check')
  })

  it('parses step FAIL bracket', () => {
    const m = parseTestMarkerLine('[ FAIL ] yarn test:llm:core')
    expect(m?.outcome).toBe('fail')
    expect(m?.label).toBe('yarn test:llm:core')
  })

  it('parses vitest checkmark', () => {
    const m = parseTestMarkerLine(' ✓ src/utils/specLayers.test.ts (7 tests) 3ms')
    expect(m?.outcome).toBe('pass')
    expect(m?.label).toContain('specLayers.test.ts')
  })

  it('parses vitest summary', () => {
    const m = parseTestMarkerLine(' Test Files  44 passed (44)')
    expect(m?.outcome).toBe('pass')
    expect(m?.label).toContain('Test Files')
  })

  it('parses playwright line', () => {
    const m = parseTestMarkerLine(
      '[stderr]   ✓   51 e2e/path-completion.spec.ts:37:3 › path list hidden (393ms)'
    )
    expect(m?.outcome).toBe('pass')
    expect(m?.label).toContain('path-completion.spec.ts')
  })

  it('parses playwright aggregate pass', () => {
    const m = parseTestMarkerLine('  125 passed (2.3m)')
    expect(m?.outcome).toBe('pass')
    expect(m?.label).toContain('125 passed')
  })

  it('parses playwright aggregate fail', () => {
    const m = parseTestMarkerLine('  116 failed')
    expect(m?.outcome).toBe('fail')
  })

  it('parses pytest FAILED', () => {
    const m = parseTestMarkerLine(
      'FAILED tests/core/test_agent_llm.py::TestAgentLlm::test_agent (1200.3s)'
    )
    expect(m?.outcome).toBe('fail')
    expect(m?.label).toContain('test_agent_llm.py')
  })

  it('parses pytest PASSED prefix', () => {
    const m = parseTestMarkerLine(
      'PASSED tests/core/test_context_llm.py::TestContextLlm::test_add_fixture (19.4s)'
    )
    expect(m?.outcome).toBe('pass')
    expect(m?.label).toContain('test_context_llm.py')
  })

  it('parses pytest PASSED suffix', () => {
    const m = parseTestMarkerLine(
      'tests/core/test_generate_spec_parse.py::TestGenerateSpecParse::test_parse_three_sections PASSED'
    )
    expect(m?.outcome).toBe('pass')
    expect(m?.label).toContain('test_parse_three_sections')
  })

  it('parses pytest START', () => {
    const m = parseTestMarkerLine('START tests/core/test_hello_llm.py::TestHelloLlm::test_hello')
    expect(m?.outcome).toBe('start')
  })

  it('pytest START is parsed but not shown on live chip', () => {
    const m = parseTestMarkerLine(
      'START tests/core/test_hello_llm.py::TestHelloLlm::test_hello'
    )
    expect(m).not.toBeNull()
    expect(shouldShowLiveTestMarker(m!)).toBe(false)
    expect(shouldUpdateLatestTestMarker(m!)).toBe(false)
  })

  it('ignores playwright-shaped line without spec path', () => {
    expect(
      parseTestMarkerLine('[1/2] [setup] › running workspace bootstrap')
    ).toBeNull()
  })

  it('parses cargo test unit pass', () => {
    const m = parseTestMarkerLine(
      'test ntfy_notify::tests::normalize_base_rejects_empty ... ok'
    )
    expect(m?.outcome).toBe('pass')
    expect(formatTestMarkerChip(m!)).toBe(
      '(PASS) ntfy_notify::tests::normalize_base_rejects_empty'
    )
    expect(shouldUpdateLatestTestMarker(m!)).toBe(true)
  })

  it('parses cargo test unit fail', () => {
    const m = parseTestMarkerLine('test git_ops::tests::parse_graph_line_merge_commit ... FAILED')
    expect(m?.outcome).toBe('fail')
    expect(m?.label).toBe('git_ops::tests::parse_graph_line_merge_commit')
  })

  it('parses cargo test summary as aggregate', () => {
    const m = parseTestMarkerLine(
      'test result: ok. 42 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.12s'
    )
    expect(m?.outcome).toBe('pass')
    expect(shouldUpdateLatestTestMarker(m!)).toBe(false)
  })

  it('parses cargo test lines from stderr prefix', () => {
    const m = parseTestMarkerLine(
      '[stderr] test workspace_editor::tests::rejects_binary_png ... ok'
    )
    expect(m?.outcome).toBe('pass')
    expect(m?.label).toContain('rejects_binary_png')
  })

  it('ignores bare PASSED noise', () => {
    expect(parseTestMarkerLine('PASSED')).toBeNull()
  })

  it('ignores pytest FAIL: stack frames', () => {
    expect(
      parseTestMarkerLine('FAIL: tests/core/test_generate_spec_llm.py:187: in test_phased')
    ).toBeNull()
  })

  it('ignores heartbeat noise', () => {
    expect(parseTestMarkerLine('[stderr] … still running (605s this step · CPU 0%)')).toBeNull()
  })

  it('skips aggregate summaries for latest marker', () => {
    const m = parseTestMarkerLine(' Test Files  53 passed (53)')
    expect(m?.outcome).toBe('pass')
    expect(shouldUpdateLatestTestMarker(m!)).toBe(false)
    const file = parseTestMarkerLine(' ✓ src/utils/specLayers.test.ts (7 tests) 3ms')
    expect(shouldUpdateLatestTestMarker(file!)).toBe(true)
  })

  it('parses playwright line reporter progress', () => {
    const m = parseTestMarkerLine(
      '[1/10] [01-hello-llm] › e2e/hello-llm.spec.ts:22:3 › Hello LLM (real Ollama + Vision API) › hello turn completes with assistant text (no stall)'
    )
    expect(m?.outcome).toBe('start')
    expect(m?.label).toContain('hello-llm.spec.ts:22:3')
    expect(shouldShowLiveTestMarker(m!)).toBe(true)
  })

  it('parses playwright line reporter failure', () => {
    const m = parseTestMarkerLine(
      '  1) [02-agent-llm] › e2e/agent-llm.spec.ts:28:3 › Agent slash (real Ollama + Vision API) › /agent turn completes without verbose AttributeError'
    )
    expect(m?.outcome).toBe('fail')
    expect(m?.label).toContain('agent-llm.spec.ts:28:3')
  })
})

describe('PlaywrightLineTracker', () => {
  it('marks previous test pass when index advances', () => {
    const tracker = new PlaywrightLineTracker()
    const line1 =
      '[1/10] [01-hello-llm] › e2e/hello-llm.spec.ts:22:3 › Hello LLM › hello turn completes'
    const line2 =
      '[2/10] [01-hello-llm] › e2e/hello-llm.spec.ts:56:3 › Hello LLM metadata › documents resolved model'
    expect(tracker.feed(line1).map((m) => m.outcome)).toEqual(['start'])
    const second = tracker.feed(line2)
    expect(second[0]?.outcome).toBe('pass')
    expect(second[0]?.label).toContain('hello-llm.spec.ts:22:3')
    expect(second[1]?.outcome).toBe('start')
  })

  it('flushPass completes the last running test', () => {
    const tracker = new PlaywrightLineTracker()
    tracker.feed(
      '[10/10] [10-spec-generate-all] › e2e/spec-generate-all.spec.ts:1:1 › spec generate all'
    )
    const flushed = tracker.flushPass()
    expect(flushed?.outcome).toBe('pass')
    expect(flushed?.label).toContain('spec-generate-all.spec.ts')
  })

  it('does not surface pytest START from feed fallback', () => {
    const tracker = new PlaywrightLineTracker()
    expect(
      tracker.feed('START tests/core/test_hello_llm.py::TestHelloLlm::test_hello')
    ).toEqual([])
  })
})

describe('parseTestMarkerLine corpus (.bright-vision/test-suite-runs)', () => {
  const runsDir = join(process.cwd(), '../../.bright-vision/test-suite-runs')

  it('parses known shapes from saved run logs when present', () => {
    if (!existsSync(runsDir)) return
    const logs = readdirSync(runsDir).filter((f) => f.endsWith('.log'))
    expect(logs.length).toBeGreaterThan(0)

    let expected = 0
    let parsed = 0
    const misses: string[] = []

    for (const name of logs) {
      const text = readFileSync(join(runsDir, name), 'utf8')
      for (const raw of text.split('\n')) {
        if (!corpusExpectsParse(raw)) continue
        expected++
        const marker = parseTestMarkerLine(raw)
        if (marker) parsed++
        else if (misses.length < 12) misses.push(raw.trim().slice(0, 140))
      }
    }

    expect(expected).toBeGreaterThan(100)
    expect(parsed / expected).toBeGreaterThan(0.98)
    if (misses.length) {
      throw new Error(`Unparsed corpus lines:\n${misses.join('\n')}`)
    }
  })
})
