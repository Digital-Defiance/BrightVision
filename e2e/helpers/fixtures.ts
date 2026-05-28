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

/** Cecli agent UpdateTodoList imported into workspace Tasks (dogfood bridge). */
export function agentPlanTodoStore(): TodoStore {
  const now = '2026-01-01T00:00:00.000Z'
  const item = {
    id: 'agent-plan-e2e',
    title: 'Draft roadmap items',
    spec: '',
    requirements: '',
    design: '',
    tasks_md: '## Implementation tasks\n\n- [ ] Explore codebase\n- [ ] Draft roadmap items in docs/ROADMAP.md\n',
    depends_on: [] as string[],
    branch: '',
    pr_url: '',
    status: 'in_progress' as const,
    links: ['cecli:agent-todo:.cecli/agents/e2e/todo.txt'],
    checklist: [
      { id: 'c1', text: 'Explore codebase', done: false },
      { id: 'c2', text: 'Draft roadmap items in docs/ROADMAP.md', done: false },
    ],
    created_at: now,
    updated_at: now,
  }
  return {
    version: 1,
    activeId: item.id,
    todos: [item],
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

/** Assistant turn with proposed SEARCH/REPLACE but no `edited_files` (manual apply e2e). */
export function proposedEditTurnEvents() {
  return [
    {
      type: 'token',
      text: '► **ANSWER**\n\n```src/example.ts\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n```\n',
    },
    { type: 'done', edited_files: [] as string[] },
  ]
}

/** Engine auto-applied edit — `done.edited_files` matches proposed block path. */
export function engineAppliedEditTurnEvents() {
  return [
    {
      type: 'token',
      text: '► **ANSWER**\n\n```src/example.ts\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE\n```\n',
    },
    { type: 'done', edited_files: ['src/example.ts'] },
  ]
}

/** Non-edit fenced code (syntax display only). */
export function displayFenceTurnEvents() {
  return [
    {
      type: 'token',
      text: '► **ANSWER**\nExample:\n\n```python\nprint("e2e-display-fence")\n```\n',
    },
    { type: 'done', edited_files: [] as string[] },
  ]
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

/** Assistant answer with GFM lists/bold (no proposed-edit fences). */
export function markdownAnswerTurnEvents() {
  return [
    { type: 'token', text: '► **THINKING**\nReading roadmap.\n' },
    {
      type: 'token',
      text:
        '► **ANSWER**\n**Open Items:**\n- **#21** — EARS linter\n- **#22** — spec index\n\nUse `yarn dogfood:agent`.\n',
    },
    { type: 'done', edited_files: [] as string[] },
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

/** Core `/clear` command acknowledgement (no assistant body). */
export function clearTurnEvents() {
  return [
    { type: 'tool_output', text: 'All chat history cleared.' },
    { type: 'done', edited_files: [] },
  ]
}

/** Assistant lists files to add — exercises roadmap #32 tray + proceed CTA. */
export function suggestedFilesTurnEvents() {
  return [
    {
      type: 'token',
      text: `► **ANSWER**\nAdd these next:\n\n- \`src/suggested-a.ts\`\n- \`src/suggested-b.ts\`\n\nPlease add these files when ready.\n`,
    },
    { type: 'done', edited_files: [] },
  ]
}

/** Path list without “please add” CTA — tray shows Add all / Add while busy. */
export function suggestedFilesTurnEventsNoCta() {
  return [
    {
      type: 'token',
      text: `► **ANSWER**\nRelated paths:\n\n- \`src/suggested-a.ts\`\n- \`src/suggested-b.ts\`\n`,
    },
    { type: 'done', edited_files: [] },
  ]
}

/** Incomplete turn — mock route should hang until the client aborts (queue / stop tests). */
export function hangingTurnEvents() {
  return [{ type: 'token', text: '► **REASONING**\nWorking…\n' }]
}

/**
 * Simulates providers that emit cumulative text snapshots per chunk (causes doubled words if appended naively).
 */
export function cumulativeStreamTurnEvents() {
  const deltas = [
    '► **THINKING**\n',
    'In ',
    'Progress',
    '\n► **ANSWER**\n',
    'Workspace',
    ' roadmap',
    '.',
  ]
  let full = ''
  const events: { type: string; text: string }[] = []
  for (const part of deltas) {
    full += part
    events.push({ type: 'token', text: full })
  }
  events.push({ type: 'done', edited_files: [] })
  return events
}

/** Tool output mid-stream (e.g. /add files) before assistant finishes. */
export function interleavedToolTurnEvents() {
  return [
    { type: 'token', text: '► **ANSWER**\nReading roadmap.\n' },
    { type: 'tool_output', text: 'Added docs/ROADMAP.md to the chat' },
    { type: 'tool_output', text: 'Added docs/index.html to the chat' },
    { type: 'token', text: '\n\n**In Progress**\n' },
    { type: 'done', edited_files: [] },
  ]
}

/** Repo scan style determinate progress before assistant tokens (Vision activity bar). */
export function scanProgressTurnEvents() {
  return [
    {
      type: 'progress',
      label: 'Scanning repo',
      current: 40,
      total: 100,
      message: '40/100',
    },
    {
      type: 'progress',
      label: 'Scanning repo',
      current: 100,
      total: 100,
      message: '100/100',
    },
    { type: 'token', text: '► **ANSWER**\nDone scanning.\n' },
    { type: 'done', edited_files: [] },
  ]
}
