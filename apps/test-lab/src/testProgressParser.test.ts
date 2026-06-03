import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  corpusExpectsParse,
  formatTestMarkerChip,
  parseTestMarkerLine,
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
