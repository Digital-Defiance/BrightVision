/**
 * Extract PASS/FAIL markers from mixed test output (pytest, vitest, playwright, shell).
 * Shapes calibrated against `.bright-vision/test-suite-runs/*.log`.
 */

export type TestMarkerOutcome = 'pass' | 'fail' | 'skip' | 'start'

export type TestMarker = {
  outcome: TestMarkerOutcome
  label: string
  raw: string
}

const STRIP_STDERR = /^\[stderr\]\s*/

/** Lines we expect to parse — used by corpus tests over saved run logs. */
export const CORPUS_SHOULD_PARSE = [
  /^\[?\s*SUCCESS\s*\]/i,
  /^\[?\s*FAIL\s*\]/i,
  /^PASS(?:ED)?:\s+/i,
  /^PASS\s+\S/i,
  /^PASSED\s+\S/i,
  /\S+\s+PASSED$/i,
  /^FAILED\s+\S/i,
  /^START\s+\S/i,
  /^\s*✓\s+/,
  /^\s*✘\s+/,
  /^\s*-\s+\d+\s+/,
  /^Test Files\s+\d+\s+(passed|failed)/i,
  /^Tests\s+\d+\s+(passed|failed)/i,
  /^\d+\s+(passed|failed)\s*\(/i,
  /^\d+\s+failed$/i,
]

const IGNORE_LINE = [
  /^PASSED$/i,
  /^FAILED$/i,
  /^FAIL:\s/, // pytest stack frames, not the test node id
  /^RUN\s+v\d/i,
  /^running \d+ tests/i,
  /^… still running/,
  /^All workspace checks passed/i,
  /^error Command failed/i,
]

const PATTERNS: Array<{ outcome: TestMarkerOutcome; re: RegExp }> = [
  { outcome: 'fail', re: /^\[?\s*FAIL\s*\]/i },
  { outcome: 'pass', re: /^\[\s*SUCCESS\s*\]/i },
  { outcome: 'fail', re: /^FAILED\s+/i },
  { outcome: 'pass', re: /^PASSED\s+/i },
  { outcome: 'pass', re: /^PASS(?:ED)?:\s+/i },
  { outcome: 'pass', re: /^PASS\s+\S/i },
  { outcome: 'start', re: /^START\s+/i },
  { outcome: 'pass', re: /^Test Files\s+\d+\s+passed/i },
  { outcome: 'fail', re: /^Test Files\s+\d+\s+failed/i },
  { outcome: 'pass', re: /^Tests\s+\d+\s+passed/i },
  { outcome: 'fail', re: /^Tests\s+\d+\s+failed/i },
  { outcome: 'pass', re: /^\d+\s+passed\s*\(/i },
  { outcome: 'fail', re: /^\d+\s+failed(?:\s*\(|$)/i },
  { outcome: 'pass', re: /^\s*✓\s+/ },
  { outcome: 'pass', re: /^\s*✔\s+/ },
  { outcome: 'fail', re: /^\s*✘\s+/ },
  { outcome: 'fail', re: /^\s*×\s+/ },
  { outcome: 'skip', re: /^\s*-\s+\d+\s+/ },
  { outcome: 'pass', re: /\S+\s+PASSED$/i },
  { outcome: 'fail', re: /\S+\s+FAILED$/i },
]

function normalizeLine(line: string): string {
  return line.replace(STRIP_STDERR, '').trim()
}

function shouldIgnore(line: string): boolean {
  return IGNORE_LINE.some((re) => re.test(line))
}

function labelFromBracketStep(line: string): string {
  return line.replace(/^\[?\s*(?:SUCCESS|FAIL)\s*\]\s*/i, '').trim()
}

function labelFromPlaywright(line: string): string {
  const m = line.match(/^\s*[✓✘×-]\s+\d+\s+(.+)$/)
  return m?.[1]?.trim() || line.trim()
}

function labelFromPytest(line: string): string {
  const m = line.match(/^(?:FAILED|PASSED|START)\s+(.+?)(?:\s+\([\d.]+s\))?$/i)
  if (m) return m[1].trim()
  const tail = line.match(/^(.+?)\s+(?:PASSED|FAILED)$/i)
  return tail?.[1]?.trim() || line.trim()
}

function labelFromVitest(line: string): string {
  const m = line.match(/^\s*[✓✘×-]\s+(.+?)(?:\s+\([\d.]+\s*ms\))?$/i)
  return m?.[1]?.trim() || line.trim()
}

function labelFromShellPass(line: string): string {
  const m = line.match(/^PASS(?:ED)?:\s+(.+)$/i)
  if (m) return m[1].trim()
  const bare = line.match(/^PASS\s+(.+)$/i)
  return bare?.[1]?.trim() || line.trim()
}

function labelForLine(line: string, outcome: TestMarkerOutcome): string {
  if (/^\[?\s*(?:SUCCESS|FAIL)\s*\]/i.test(line)) return labelFromBracketStep(line)
  if (/^\s*[✓✘×-]\s+\d+\s+/.test(line)) return labelFromPlaywright(line)
  if (/^(?:FAILED|PASSED|START)\s+/i.test(line) || /\s+(?:PASSED|FAILED)$/i.test(line)) {
    return labelFromPytest(line)
  }
  if (/^\s*[✓✘×-]\s+/.test(line)) return labelFromVitest(line)
  if (/^PASS/i.test(line)) return labelFromShellPass(line)
  return line.trim()
}

export function parseTestMarkerLine(rawLine: string): TestMarker | null {
  const line = normalizeLine(rawLine)
  if (!line || shouldIgnore(line)) return null

  for (const { outcome, re } of PATTERNS) {
    if (!re.test(line)) continue
    return { outcome, label: labelForLine(line, outcome), raw: rawLine }
  }
  return null
}

export function isAggregateTestMarker(marker: TestMarker): boolean {
  const label = marker.label
  if (/^Test Files\s/i.test(label)) return true
  if (/^Tests\s+\d+\s+(passed|failed)/i.test(label)) return true
  if (/^\d+\s+(passed|failed)\s*\(/i.test(label)) return true
  if (/^\[?\s*(?:SUCCESS|FAIL)\s*\]/i.test(label)) return true
  return false
}

/** Prefer individual test paths over suite summaries for the live marker chip. */
export function shouldUpdateLatestTestMarker(marker: TestMarker): boolean {
  if (marker.outcome === 'fail') return true
  if (marker.outcome === 'start') return false
  if (marker.outcome === 'skip') return false
  if (isAggregateTestMarker(marker)) return false
  return true
}

export function formatTestMarkerChip(marker: TestMarker): string {
  const tag =
    marker.outcome === 'pass'
      ? 'PASS'
      : marker.outcome === 'fail'
        ? 'FAIL'
        : marker.outcome === 'skip'
          ? 'SKIP'
          : 'START'
  return `(${tag}) ${marker.label}`
}

/** Whether a normalized log line is a known test-result shape (for corpus coverage). */
export function corpusExpectsParse(line: string): boolean {
  const norm = normalizeLine(line)
  if (!norm || shouldIgnore(norm)) return false
  return CORPUS_SHOULD_PARSE.some((re) => re.test(norm))
}
