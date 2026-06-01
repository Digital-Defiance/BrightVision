/** Kiro-style phased spec wizard — layer gates and prompts. */

export type SpecLayerSection = 'requirements' | 'design' | 'tasks_md'

export type SpecWizardTab = 'requirements' | 'design' | 'tasks' | 'checklist'

export interface SpecLayerDraft {
  requirements: string
  design: string
  tasks_md: string
}

export function layerHasContent(text: string | undefined | null): boolean {
  return Boolean(text?.trim())
}

export function specLayersFromDraft(draft: SpecLayerDraft) {
  return {
    requirements: layerHasContent(draft.requirements),
    design: layerHasContent(draft.design),
    tasks: layerHasContent(draft.tasks_md),
  }
}

export interface SpecWizardPrompt {
  section: SpecLayerSection
  title: string
  defaultPrompt: string
  helper: string
}

export function defaultPromptForSection(
  section: SpecLayerSection,
  todoTitle?: string
): string {
  const title = todoTitle?.trim()
  switch (section) {
    case 'requirements':
      return title ? `Feature: ${title}` : 'Describe the feature and constraints'
    case 'design':
      return 'Architecture and components that satisfy the requirements'
    case 'tasks_md':
      return 'Ordered implementation steps with dependencies'
  }
}

export function wizardPromptForSection(
  section: SpecLayerSection,
  todoTitle?: string
): SpecWizardPrompt {
  const base = defaultPromptForSection(section, todoTitle)
  switch (section) {
    case 'requirements':
      return {
        section,
        title: 'Generate requirements',
        defaultPrompt: base,
        helper:
          'Uses your prompt and any existing requirements draft. Attach files via the context bar, /add in Chat or Spec, or Add folder on Chat — included automatically.',
      }
    case 'design':
      return {
        section,
        title: 'Generate design',
        defaultPrompt: base,
        helper:
          'Always includes the current requirements. May extend a partial design draft. Session file context (/add) is included.',
      }
    case 'tasks_md':
      return {
        section,
        title: 'Generate implementation tasks',
        defaultPrompt: base,
        helper:
          'Includes requirements and design. May extend a partial tasks draft. Session file context (/add) is included.',
      }
  }
}

export interface SpecTabGateResult {
  allowed: boolean
  message?: string
}

/** Block tab switches when prerequisite layers are missing. */
export function gateSpecTabSwitch(
  from: SpecWizardTab,
  to: SpecWizardTab,
  layers: SpecLayerDraft
): SpecTabGateResult {
  if (to === 'checklist') return { allowed: true }
  const has = specLayersFromDraft(layers)
  if (to === 'requirements') return { allowed: true }
  if (to === 'design' && !has.requirements) {
    return {
      allowed: false,
      message: 'Generate or write requirements before opening Design.',
    }
  }
  if (to === 'tasks') {
    if (!has.requirements) {
      return {
        allowed: false,
        message: 'Generate or write requirements before opening Implementation tasks.',
      }
    }
    if (!has.design) {
      return {
        allowed: false,
        message: 'Generate or write design before opening Implementation tasks.',
      }
    }
  }
  if (from === 'requirements' && to === 'tasks' && !has.design) {
    return {
      allowed: false,
      message: 'Generate or write design before skipping to Implementation tasks.',
    }
  }
  return { allowed: true }
}

export interface SpecWizardNudge {
  id: string
  severity: 'info' | 'warning'
  message: string
  actionSection?: SpecLayerSection
  actionLabel?: string
}

/** Banners on the active spec tab when current or next wizard step is incomplete. */
export function specWizardNudges(
  tab: SpecWizardTab,
  layers: SpecLayerDraft
): SpecWizardNudge[] {
  const has = specLayersFromDraft(layers)
  const out: SpecWizardNudge[] = []
  if (tab === 'requirements') {
    if (!has.requirements) {
      out.push({
        id: 'req-missing',
        severity: 'warning',
        message: 'Step 1 — generate or write requirements (EARS-style).',
        actionSection: 'requirements',
        actionLabel: 'Generate requirements',
      })
    } else if (!has.design) {
      out.push({
        id: 'design-next',
        severity: 'info',
        message: 'Requirements ready — generate design when you are satisfied with this layer.',
        actionSection: 'design',
        actionLabel: 'Generate design',
      })
    }
    return out
  }
  if (tab === 'design') {
    if (!has.requirements) {
      out.push({
        id: 'req-first',
        severity: 'warning',
        message: 'Requirements are required before design.',
        actionSection: 'requirements',
        actionLabel: 'Generate requirements',
      })
    } else if (!has.design) {
      out.push({
        id: 'design-missing',
        severity: 'warning',
        message: 'Step 2 — generate or write design that cites your REQ ids.',
        actionSection: 'design',
        actionLabel: 'Generate design',
      })
    } else if (!has.tasks) {
      out.push({
        id: 'tasks-next',
        severity: 'info',
        message: 'Design ready — generate implementation tasks next.',
        actionSection: 'tasks_md',
        actionLabel: 'Generate tasks',
      })
    }
    return out
  }
  if (tab === 'tasks') {
    if (!has.requirements) {
      out.push({
        id: 'req-first',
        severity: 'warning',
        message: 'Requirements are required before implementation tasks.',
        actionSection: 'requirements',
        actionLabel: 'Generate requirements',
      })
    } else if (!has.design) {
      out.push({
        id: 'design-first',
        severity: 'warning',
        message: 'Design is required before implementation tasks.',
        actionSection: 'design',
        actionLabel: 'Generate design',
      })
    } else if (!has.tasks) {
      out.push({
        id: 'tasks-missing',
        severity: 'warning',
        message: 'Step 3 — generate or write numbered implementation tasks.',
        actionSection: 'tasks_md',
        actionLabel: 'Generate tasks',
      })
    }
  }
  return out
}

export function sectionActivityLabel(section: SpecLayerSection): string {
  switch (section) {
    case 'requirements':
      return 'GENERATING REQUIREMENTS'
    case 'design':
      return 'GENERATING DESIGN'
    case 'tasks_md':
      return 'GENERATING TASKS'
  }
}
