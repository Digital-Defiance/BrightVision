/** Shared fixtures for spec implementation progress (tasks_md ↔ checklist ↔ agent). */

export const SPEC_PROGRESS_TASKS_MD = `## Implementation tasks

- [ ] 1. Wire generate-spec API for REQ-001 (depends: none)
  - verify: \`true\`
- [ ] 2. Add tests for REQ-002 (depends: 1)
`

export const SPEC_PROGRESS_STEP1 = '1. Wire generate-spec API for REQ-001 (depends: none)'
export const SPEC_PROGRESS_STEP2 = '2. Add tests for REQ-002 (depends: 1)'

/** Agent todo.txt with step 1 done and step 2 current (matches numbered tasks_md). */
export function agentTodoWithStep1Done(): string {
  return [
    'Done:',
    `✓ ${SPEC_PROGRESS_STEP1}`,
    '',
    'Remaining:',
    `→ ${SPEC_PROGRESS_STEP2}`,
    '',
  ].join('\n')
}

export function specProgressTodoStoreJson(taskId = 'spec-progress-1') {
  const now = new Date().toISOString()
  return {
    version: 1,
    active_id: taskId,
    todos: [
      {
        id: taskId,
        title: 'Spec progress feature',
        spec: '',
        requirements: '### REQ-001\n**WHEN** …\n**THE** system **SHALL** …\n',
        design: '## Overview\n\n',
        tasks_md: SPEC_PROGRESS_TASKS_MD,
        depends_on: [],
        branch: '',
        pr_url: '',
        status: 'in_progress',
        links: [],
        checklist: [],
        created_at: now,
        updated_at: now,
      },
    ],
    templates: ['feature', 'bugfix', 'refactor', 'spec-driven'],
  }
}
