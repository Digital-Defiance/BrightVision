import type { TodoStore } from '../../src/todos/types'

export const E2E_SESSION_ID = 'e2e-session-001'

export function emptyTodoStore(): TodoStore {
  return {
    version: 1,
    activeId: null,
    todos: [],
    templates: ['feature', 'bugfix', 'refactor', 'spec-driven'],
  }
}

export function sampleTodoStore(): TodoStore {
  const a = makeTodo('task-a', 'First task', 'open')
  const b = makeTodo('task-b', 'Blocked successor', 'open', ['task-a'])
  return {
    version: 1,
    activeId: null,
    todos: [a, b],
    templates: ['feature', 'bugfix', 'refactor', 'spec-driven'],
  }
}

function makeTodo(
  id: string,
  title: string,
  status: 'open' | 'in_progress' | 'done' | 'cancelled',
  depends_on: string[] = []
) {
  const now = '2026-01-01T00:00:00.000Z'
  return {
    id,
    title,
    spec: '',
    requirements: `# ${title}\n\nRequirements here.`,
    design: '## Design\n\nDetails.',
    tasks_md: '- [ ] Step one\n- [ ] Step two',
    depends_on,
    branch: '',
    pr_url: '',
    status,
    links: [],
    checklist: [{ id: 'c1', text: 'Checklist item', done: false }],
    created_at: now,
    updated_at: now,
  }
}

/** Default assistant turn for mocked SSE. */
export function defaultTurnEvents() {
  return [
    { type: 'token', text: '► **THINKING**\nConsidering the request.\n' },
    {
      type: 'token',
      text: '► **ANSWER**\nHere is the reply.\n\n```\nsrc/example.ts\n```\n```text\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n```\n',
    },
    { type: 'tool_output', text: 'Tokens: 120 sent, 45 received' },
    { type: 'done', edited_files: ['src/example.ts'] },
  ]
}

export function confirmTurnEvents() {
  return [
    {
      type: 'confirm',
      confirm_id: 'confirm-e2e-1',
      question: 'Apply changes to src/example.ts?',
      subject: 'src/example.ts',
    },
  ]
}

export function slowTurnEvents() {
  return [
    { type: 'token', text: '► **REASONING**\nWorking…\n' },
    { type: 'token', text: '► **ANSWER**\nDone.\n' },
    { type: 'done', edited_files: [] },
  ]
}

/** Incomplete turn — mock route should hang until the client aborts (queue / stop tests). */
export function hangingTurnEvents() {
  return [{ type: 'token', text: '► **REASONING**\nWorking…\n' }]
}
