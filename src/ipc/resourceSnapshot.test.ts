import { describe, expect, it } from 'vitest'
import { formatResourceOverlayLine, resourceOverlayRows } from './resourceSnapshot'

const sample = {
  cpuPct: 16,
  memUsedMb: 48555,
  memTotalMb: 65536,
  memPct: 74,
  gpuPct: null as number | null,
  scope: 'system',
}

describe('resourceSnapshot', () => {
  it('builds stacked rows with GPU dash when unknown', () => {
    const rows = resourceOverlayRows(sample, true)
    expect(rows.map((r) => r.label)).toEqual(['CPU', 'RAM', 'GPU'])
    expect(rows[0].value).toBe('16%')
    expect(rows[1].value).toBe('74%')
    expect(rows[2].value).toBe('—')
  })

  it('includes GPU percent when present', () => {
    const rows = resourceOverlayRows({ ...sample, gpuPct: 42 }, true)
    expect(rows[2].value).toBe('42%')
  })

  it('formatResourceOverlayLine joins rows', () => {
    expect(formatResourceOverlayLine(sample, true)).toContain('16%')
    expect(formatResourceOverlayLine(sample, true)).toContain('GPU')
  })
})
