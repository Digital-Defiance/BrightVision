import { describe, expect, it } from 'vitest'
import { buildActivityPresentation, formatProgressElapsedSuffix } from './progressDisplay'

describe('formatProgressElapsedSuffix', () => {
  it('reformats seconds suffix in conventional mode', () => {
    expect(formatProgressElapsedSuffix('Running slash commands (1864s)', { brightDate: false })).toBe(
      'Running slash commands (31m 4s)'
    )
  })

  it('reformats seconds suffix in BrightDate mode', () => {
    const out = formatProgressElapsedSuffix('Running slash commands (864s)', { brightDate: true })
    expect(out).toContain('md')
    expect(out).not.toMatch(/\(864s\)/)
  })
})

describe('buildActivityPresentation', () => {
  it('uses AGENT for slash preproc during agent turn', () => {
    const p = buildActivityPresentation({
      processLabel: 'Vision',
      processDetail: 'Running slash commands (120s)',
      isAgentTurn: true,
      brightDate: false,
    })
    expect(p.brand).toBe('AGENT')
    expect(p.headline).toBe('Running agent commands')
  })

  it('maps shell execution tool output', () => {
    const p = buildActivityPresentation({
      processLabel: 'Running tools',
      processDetail: 'output',
      isAgentTurn: true,
      lastToolSnippet: 'Executing shell command with 45s timeout.',
    })
    expect(p.brand).toBe('AGENT')
    expect(p.headline).toBe('Executing shell command')
  })
})
