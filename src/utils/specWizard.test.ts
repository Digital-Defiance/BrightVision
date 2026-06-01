import { describe, expect, it } from 'vitest'
import {
  gateSpecTabSwitch,
  layerHasContent,
  specWizardNudges,
  wizardPromptForSection,
} from './specWizard'

describe('specWizard', () => {
  const empty = { requirements: '', design: '', tasks_md: '' }
  const reqOnly = { requirements: '### REQ-1\nWHEN x THE system SHALL y.', design: '', tasks_md: '' }
  const reqDesign = {
    ...reqOnly,
    design: '## Overview\nREQ-1',
  }

  it('layerHasContent', () => {
    expect(layerHasContent('  ')).toBe(false)
    expect(layerHasContent('x')).toBe(true)
  })

  it('blocks design tab without requirements', () => {
    expect(gateSpecTabSwitch('requirements', 'design', empty).allowed).toBe(false)
    expect(gateSpecTabSwitch('requirements', 'design', reqOnly).allowed).toBe(true)
  })

  it('blocks tasks tab without design', () => {
    expect(gateSpecTabSwitch('design', 'tasks', reqOnly).allowed).toBe(false)
    expect(gateSpecTabSwitch('design', 'tasks', reqDesign).allowed).toBe(true)
  })

  it('nudges requirements step on requirements tab', () => {
    const n = specWizardNudges('requirements', empty)
    expect(n[0]?.actionSection).toBe('requirements')
  })

  it('nudges design next when requirements present', () => {
    const n = specWizardNudges('requirements', reqOnly)
    expect(n.some((x) => x.actionSection === 'design')).toBe(true)
  })

  it('wizard prompts mention context', () => {
    expect(wizardPromptForSection('design').helper).toMatch(/context/)
  })
})
