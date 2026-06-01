import { describe, expect, it } from 'vitest'
import {
  assessGeneratedSpecLayers,
  assessSpecRichness,
  designReferencesRequirements,
  MOCK_SANE_SPEC_LAYERS,
  normalizeSpecLayerTraceability,
} from './specLayers'

describe('assessGeneratedSpecLayers', () => {
  it('accepts mock sane fixture', () => {
    const r = assessGeneratedSpecLayers(MOCK_SANE_SPEC_LAYERS)
    expect(r.ok).toBe(true)
    expect(r.issues).toEqual([])
  })

  it('rejects empty layers', () => {
    const r = assessGeneratedSpecLayers({ requirements: '', design: '', tasks_md: '' })
    expect(r.ok).toBe(false)
    expect(r.issues.length).toBeGreaterThan(2)
  })

  it('accepts design that cites requirement numbers without REQ- prefix', () => {
    const req = `### REQ-001\n**WHEN** x\n**THE** system **SHALL** do a.\n### REQ-002\n**WHEN** y\n**THE** system **SHALL** do b.\n`
    const design = '## Overview\nRequirement 1 handles HTTP; requirement 2 stores state.'
    expect(designReferencesRequirements(req, design)).toBe(true)
    const r = assessGeneratedSpecLayers({
      requirements: req,
      design,
      tasks_md: '- [ ] 1. Step (depends: none)',
    })
    expect(r.ok).toBe(true)
  })

  it('normalize adds REQ traceability for thin design', () => {
    const req = `### REQ-001\n**WHEN** x\n**THE** system **SHALL** do a.\n### REQ-002\n**WHEN** y\n**THE** system **SHALL** do b.\n`
    const normalized = normalizeSpecLayerTraceability({
      requirements: req,
      design: '## Overview\nHTTP API only.',
      tasks_md: '- [ ] 1. Step (depends: none)',
    })
    const r = assessGeneratedSpecLayers(normalized)
    expect(r.ok).toBe(true)
  })

  it('rejects requirements without SHALL', () => {
    const r = assessGeneratedSpecLayers({
      requirements: '### REQ-001\n**WHEN** x\n**THE** system shows y.\n',
      design: '## Design\nREQ-001',
      tasks_md: '- [ ] 1. Step (depends: none)',
    })
    expect(r.ok).toBe(false)
    expect(r.issues).toContain('requirements missing SHALL')
  })
})

describe('assessSpecRichness', () => {
  it('treats the mock fixture as Kiro-rich', () => {
    expect(assessSpecRichness(MOCK_SANE_SPEC_LAYERS).ok).toBe(true)
  })

  it('flags thin specs with deepen suggestions', () => {
    const r = assessSpecRichness({
      requirements: '### REQ-001\n**WHEN** x\n**THE** system **SHALL** y.\n',
      design: '## Overview\nshort',
      tasks_md: '- [ ] 1. Do it (depends: none)',
    })
    expect(r.ok).toBe(false)
    const joined = r.issues.join(' ')
    expect(joined).toMatch(/User Story/i)
    expect(joined).toMatch(/design:/)
    expect(joined).toMatch(/tasks:/)
  })
})
