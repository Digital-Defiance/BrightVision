/**
 * Heuristic checks that generated three-layer specs are usable (EARS + tasks).
 * Shared by unit tests and Playwright e2e.
 */

export interface SpecLayerAssessment {
  ok: boolean
  issues: string[]
}

export interface SpecLayers {
  requirements: string
  design: string
  tasks_md: string
}

/** True when design text traces back to REQ ids (or equivalent) in requirements. */
export function designReferencesRequirements(requirements: string, design: string): boolean {
  const req = (requirements || '').trim()
  const des = (design || '').trim()
  if (!des || !/REQ-\d+/i.test(req)) return true
  if (/REQ-\d+/i.test(des)) return true
  const nums = [...req.matchAll(/REQ-(\d+)/gi)].map((m) => m[1]).filter(Boolean)
  if (nums.some((n) => new RegExp(`\\b${n}\\b`).test(des))) return true
  if (/\brequirement\s*\d+/i.test(des)) return true
  return false
}

/** Mirror of Python ``normalize_spec_layer_traceability`` (small-model guard). */
export function normalizeSpecLayerTraceability(layers: SpecLayers): SpecLayers {
  const req = (layers.requirements || '').trim()
  const design = (layers.design || '').trim()
  const ids = [...req.matchAll(/REQ-\d+/gi)].map((m) => m[0].toUpperCase())
  const unique = [...new Set(ids)]
  if (!unique.length || designReferencesRequirements(req, design)) {
    return layers
  }
  const trace = `Covers ${unique.join(', ')}.`
  if (!design) {
    return { ...layers, design: `## Traceability\n${trace}` }
  }
  return { ...layers, design: `${design.replace(/\s+$/, '')}\n\n## Traceability\n${trace}` }
}

export function assessGeneratedSpecLayers(layers: SpecLayers): SpecLayerAssessment {
  const normalized = normalizeSpecLayerTraceability(layers)
  const issues: string[] = []
  const req = (normalized.requirements || '').trim()
  const design = (normalized.design || '').trim()
  const tasks = (normalized.tasks_md || '').trim()

  if (!req) issues.push('requirements empty')
  if (!design) issues.push('design empty')
  if (!tasks) issues.push('tasks_md empty')

  if (req) {
    if (!/REQ-\d+/i.test(req)) issues.push('requirements missing REQ-### id')
    if (!/\bshall\b/i.test(req)) issues.push('requirements missing SHALL')
    if (!/\bwhen\b/i.test(req)) issues.push('requirements missing WHEN')
  }

  if (tasks && !/(?:^\s*[-*]\s*\[[ xX]\]\s*)?\d+\.\s+/m.test(tasks)) {
    issues.push('tasks_md missing numbered implementation steps')
  }

  if (design && req && !designReferencesRequirements(req, design)) {
    if (!(tasks && designReferencesRequirements(req, tasks))) {
      issues.push('design does not reference any REQ id')
    }
  }

  return { ok: issues.length === 0, issues }
}

/** Mock / fixture content that passes {@link assessGeneratedSpecLayers}. */
export const MOCK_SANE_SPEC_LAYERS: SpecLayers = {
  requirements: `### Introduction
The spec wizard lets a user author and persist three-layer specs for a task.

### REQ-001: View spec layers
**User Story:** As a user, I want to open a task's spec, so that I can review its layers.

**Acceptance Criteria**
1. **WHEN** the user opens the feature **THE** system **SHALL** show the task spec layers.
2. **IF** no spec exists yet **THEN THE** system **SHALL** show empty editable layers.

### REQ-002: Persist requirements
**User Story:** As a user, I want my edits saved, so that they survive a reload.

**Acceptance Criteria**
1. **WHEN** the user saves requirements **THE** system **SHALL** persist markdown under \`.cecli/specs/<id>/\`.
2. **WHILE** a save is in flight **THE** system **SHALL** indicate progress.`,
  design: `### Overview
Covers REQ-001 UI flow and REQ-002 disk sync.
### Architecture
A spec panel reads/writes layers through the Vision HTTP API.
### Components and Interfaces
- Spec wizard panel — REQ-001.
- generate-spec / save endpoints — REQ-002.
### Data Models
A spec with requirements, design, and tasks_md strings per task.
### Error Handling
Surface a warning snackbar when a save fails (REQ-002).
### Testing Strategy
Unit tests for layer state plus e2e for REQ-001 and REQ-002.`,
  tasks_md: `- [ ] 1. Wire generate-spec API for REQ-001 (depends: none)
- [ ] 2. Persist layers to disk for REQ-002 (depends: 1)
- [ ] 3. Add e2e coverage for REQ-001 and REQ-002 (depends: 2)`,
}

/** Advisory depth suggestions (mirror of Python ``assess_spec_richness``). */
export function assessSpecRichness(layers: SpecLayers): SpecLayerAssessment {
  const suggestions: string[] = []
  const req = (layers.requirements || '').trim()
  const design = (layers.design || '').trim()
  const tasks = (layers.tasks_md || '').trim()

  if (req) {
    if (!/user story/i.test(req)) {
      suggestions.push('requirements: add a User Story line to each requirement')
    }
    const criteria = (req.match(/^\s*\d+\.\s+/gm) || []).length
    const ids = new Set([...req.matchAll(/REQ-\d+/gi)].map((m) => m[0].toUpperCase()))
    if (ids.size < 2 && criteria < 2) {
      suggestions.push('requirements: add more requirements and acceptance criteria')
    }
  }

  if (design) {
    const low = design.toLowerCase()
    const subsections: Array<[string, string]> = [
      ['architecture', 'Architecture'],
      ['component', 'Components and Interfaces'],
      ['data model', 'Data Models'],
      ['error', 'Error Handling'],
      ['testing', 'Testing Strategy'],
    ]
    const missing = subsections.filter(([key]) => !low.includes(key)).map(([, label]) => label)
    if (missing.length) suggestions.push(`design: add subsections (${missing.join(', ')})`)
  }

  if (tasks) {
    const steps = (tasks.match(/^\s*(?:-\s*\[[ xX]\]\s*)?\d+\./gm) || []).length
    if (steps < 3) suggestions.push('tasks: break the work into more incremental steps')
  }

  return { ok: suggestions.length === 0, issues: suggestions }
}
