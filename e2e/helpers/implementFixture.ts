/** Fixtures for implement workspace inject e2e (generic repo, checklist-driven paths). */

export const IMPLEMENT_E2E_TASK_ID = 'implement-e2e-1'
export const IMPLEMENT_E2E_TITLE = 'Implement workspace E2E'

export const IMPLEMENT_NAMED_PATH_STEP =
  '2. Implement auth token helper in `src/auth/token.ts` (depends: 1)'
export const IMPLEMENT_PATHLESS_STEP =
  '1. Scaffold the workspace and shared tooling (depends: none)'
export const IMPLEMENT_RESUME_STEP2 =
  '2. Add unit tests in `src/api/handler.test.ts` (depends: 1)'
export const IMPLEMENT_AUTO_ADVANCE_STEP3 =
  '3. Add unit tests in `src/auth/token.test.ts` (depends: 2)'

/** Appended in LLM e2e to reduce ContextManager explore loops on small models. */
export const IMPLEMENT_NAMED_PATH_NUDGE =
  'Use ContextManager create on the missing file, then ReadRange and EditText. ' +
  'Export a function getToken(): string. Do not ls or explore other paths.'

export const IMPLEMENT_RESUME_NUDGE =
  'Use ContextManager create on src/api/handler.test.ts if missing, then ReadRange and EditText. ' +
  'Add tests for handleRequest. Do not ls or explore other paths.'

/** Auto-advance verify gate needs EditText — ContextManager-only does not count. */
export const IMPLEMENT_AUTO_ADVANCE_NUDGE =
  `${IMPLEMENT_NAMED_PATH_NUDGE} You must use EditText to write the file; shell or create-only will not advance.`

const REQ = `### REQ-001
**WHEN** a client calls the API
**THE** system **SHALL** handle the request in \`src/api/handler.ts\`
`

const DESIGN = `## Overview

Minimal Node service with auth helper and HTTP handler modules.
`

function baseTodo(overrides: Record<string, unknown> = {}) {
  const now = '2026-06-01T12:00:00.000Z'
  return {
    id: IMPLEMENT_E2E_TASK_ID,
    title: IMPLEMENT_E2E_TITLE,
    spec: '',
    requirements: REQ,
    design: DESIGN,
    depends_on: [] as string[],
    branch: '',
    pr_url: '',
    status: 'open' as const,
    links: [] as string[],
    checklist: [] as { id: string; text: string; done: boolean }[],
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

/** Step 2 names a concrete file path — drives ContextManager create guidance. */
export function implementNamedPathTodoStore() {
  const tasks_md = `## Implementation tasks

- [ ] 1. Review top-level layout (depends: none)
- [ ] 2. Implement auth token helper in \`src/auth/token.ts\` (depends: 1)
`
  const todo = baseTodo({
    status: 'in_progress',
    tasks_md,
    checklist: [
      { id: 'c1', text: '1. Review top-level layout (depends: none)', done: false },
      { id: 'c2', text: IMPLEMENT_NAMED_PATH_STEP, done: false },
    ],
  })
  return {
    version: 1,
    activeId: IMPLEMENT_E2E_TASK_ID,
    todos: [todo],
    templates: ['feature', 'bugfix', 'refactor', 'spec-driven'],
  }
}

/** Step 1 has no paths — inject should point at implementation tasks. */
export function implementPathlessTodoStore() {
  const tasks_md = `## Implementation tasks

- [ ] 1. Scaffold the workspace and shared tooling (depends: none)
- [ ] 2. Create \`src/api/handler.ts\` (depends: 1)
`
  const todo = baseTodo({
    status: 'in_progress',
    tasks_md,
    checklist: [
      { id: 'c1', text: IMPLEMENT_PATHLESS_STEP, done: false },
      { id: 'c2', text: '2. Create `src/api/handler.ts` (depends: 1)', done: false },
    ],
  })
  return {
    version: 1,
    activeId: IMPLEMENT_E2E_TASK_ID,
    todos: [todo],
    templates: ['feature', 'bugfix', 'refactor', 'spec-driven'],
  }
}

/** Resume after step 1 deliverable exists on disk. */
export function implementResumeTodoStore() {
  const tasks_md = `## Implementation tasks

- [x] 1. Create \`src/api/handler.ts\` (depends: none)
- [ ] 2. Add unit tests in \`src/api/handler.test.ts\` (depends: 1)
`
  const todo = baseTodo({
    status: 'in_progress',
    tasks_md,
    checklist: [
      { id: 'c1', text: '1. Create `src/api/handler.ts` (depends: none)', done: true },
      { id: 'c2', text: IMPLEMENT_RESUME_STEP2, done: false },
    ],
  })
  return {
    version: 1,
    activeId: IMPLEMENT_E2E_TASK_ID,
    todos: [todo],
    templates: ['feature', 'bugfix', 'refactor', 'spec-driven'],
  }
}

/**
 * Named-path checklist (2 items) with verify + step 3 only in tasks_md.
 * Avoids a third checklist row — the 3-item UI profile confuses models into ContextManager loops.
 */
export function implementNamedPathAutoAdvanceTodoStore() {
  const tasks_md = `## Implementation tasks

- [ ] 1. Review top-level layout (depends: none)
- [ ] 2. Implement auth token helper in \`src/auth/token.ts\` (depends: 1)
    - verify: \`test -f src/auth/token.ts\`
- [ ] 3. Add unit tests in \`src/auth/token.test.ts\` (depends: 2)
`
  const todo = baseTodo({
    status: 'in_progress',
    tasks_md,
    checklist: [
      { id: 'c1', text: '1. Review top-level layout (depends: none)', done: false },
      { id: 'c2', text: IMPLEMENT_NAMED_PATH_STEP, done: false },
    ],
  })
  return {
    version: 1,
    activeId: IMPLEMENT_E2E_TASK_ID,
    todos: [todo],
    templates: ['feature', 'bugfix', 'refactor', 'spec-driven'],
  }
}

/** Three-step plan with verify on step 2 for auto-advance after token.ts exists. */
export function implementAutoAdvanceTodoStore() {
  const tasks_md = `## Implementation tasks

- [ ] 1. Review top-level layout (depends: none)
- [ ] 2. Implement auth token helper in \`src/auth/token.ts\` (depends: 1)
    - verify: \`test -f src/auth/token.ts\`
- [ ] 3. Add unit tests in \`src/auth/token.test.ts\` (depends: 2)
`
  const todo = baseTodo({
    status: 'in_progress',
    tasks_md,
    checklist: [
      { id: 'c1', text: '1. Review top-level layout (depends: none)', done: false },
      {
        id: 'c2',
        text: '2. Implement auth token helper in `src/auth/token.ts` (depends: 1)',
        done: false,
      },
      { id: 'c3', text: IMPLEMENT_AUTO_ADVANCE_STEP3, done: false },
    ],
  })
  return {
    version: 1,
    activeId: IMPLEMENT_E2E_TASK_ID,
    todos: [todo],
    templates: ['feature', 'bugfix', 'refactor', 'spec-driven'],
  }
}
