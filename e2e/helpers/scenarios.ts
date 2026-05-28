import type { MockCoreOptions } from './mockCoreApi'
import type { MockSessionOptions } from './session'
import {
  clearTurnEvents,
  confirmTurnEvents,
  cumulativeStreamTurnEvents,
  defaultTurnEvents,
  displayFenceTurnEvents,
  emptyTodoStore,
  engineAppliedEditTurnEvents,
  sampleTodoStore,
  scanProgressTurnEvents,
  slowTurnEvents,
  suggestedFilesTurnEvents,
  markdownAnswerTurnEvents,
} from './fixtures'
import {
  E2E_EDIT_BLOCK_NEW,
  E2E_EDIT_BLOCK_OLD,
  E2E_EDIT_BLOCK_REL,
  ensureAgentTodoCharSplitWorkspace,
  ensureEditBlockWorkspace,
  ensureTasksSeededWorkspace,
  fixtureDiskTauriHandlers,
} from './fixtureWorkspaces'

export type ScenarioName =
  | 'default'
  | 'proposed-edit'
  | 'applied-edit'
  | 'display-fence'
  | 'confirm'
  | 'suggested-files'
  | 'cumulative-stream'
  | 'scan-progress'
  | 'empty-llm'
  | 'session-transcript'
  | 'tasks-seeded'
  | 'agent-todo-char-split'
  | 'markdown-answer'

export interface ScenarioDefinition {
  /** Human label for failures */
  label: string
  /** SSE turn arrays cycled per user message */
  turns: Record<string, unknown>[][]
  /** Optional git fixture for disk-backed Tauri I/O */
  workspace?: 'edit-block' | 'tasks-seeded' | 'agent-todo-char-split'
  agentTodoImportFromDisk?: boolean
  /** Initial todos for workspace HTTP API */
  initialTodos?: ReturnType<typeof emptyTodoStore>
  /** GET /transcript body */
  transcript?: { role: 'user' | 'assistant'; content: string }[]
  /** Prime config flags */
  config?: Partial<{ autoLoadSession: boolean; autoSaveSession: boolean }>
}

export function emptyLlmTurnEvents() {
  return [
    {
      type: 'tool_warning',
      text: 'empty response received from llm (no tokens)',
    },
    { type: 'done', edited_files: [] as string[] },
  ]
}

export function sessionLoadedTurnEvents() {
  return [
    {
      type: 'tool_output',
      text: 'Session loaded: brightvision\nLoaded 2 messages and 0 files',
    },
    { type: 'done', edited_files: [] as string[] },
  ]
}

const SCENARIOS: Record<ScenarioName, ScenarioDefinition> = {
  default: {
    label: 'default chat turn',
    turns: [defaultTurnEvents(), confirmTurnEvents()],
  },
  'proposed-edit': {
    label: 'proposed SEARCH/REPLACE',
    turns: [
      [
        {
          type: 'token',
          text:
            `► **ANSWER**\n\n\`\`\`${E2E_EDIT_BLOCK_REL}\n<<<<<<< SEARCH\n${E2E_EDIT_BLOCK_OLD}=======\n${E2E_EDIT_BLOCK_NEW}>>>>>>> REPLACE\n\`\`\`\n`,
        },
        { type: 'done', edited_files: [] as string[] },
      ],
    ],
    workspace: 'edit-block',
  },
  'applied-edit': {
    label: 'engine-applied SEARCH/REPLACE',
    turns: [engineAppliedEditTurnEvents()],
  },
  'display-fence': {
    label: 'plain display code fence',
    turns: [displayFenceTurnEvents()],
  },
  confirm: {
    label: 'confirm flow',
    turns: [confirmTurnEvents()],
  },
  'suggested-files': {
    label: 'suggested files tray',
    turns: [suggestedFilesTurnEvents()],
  },
  'cumulative-stream': {
    label: 'cumulative SSE stream',
    turns: [cumulativeStreamTurnEvents()],
  },
  'scan-progress': {
    label: 'repo scan progress',
    turns: [scanProgressTurnEvents()],
  },
  'empty-llm': {
    label: 'empty LLM warning',
    turns: [emptyLlmTurnEvents()],
  },
  'session-transcript': {
    label: 'session transcript hydrate',
    turns: [slowTurnEvents()],
    transcript: [
      { role: 'user', content: 'prior user turn from saved session' },
      { role: 'assistant', content: 'prior assistant reply from saved session' },
    ],
    config: { autoLoadSession: true, autoSaveSession: true },
  },
  'tasks-seeded': {
    label: 'tasks from seeded todos.json',
    turns: [defaultTurnEvents()],
    workspace: 'tasks-seeded',
    initialTodos: sampleTodoStore(),
  },
  'agent-todo-char-split': {
    label: 'char-split agent todo → Tasks title',
    turns: [defaultTurnEvents()],
    workspace: 'agent-todo-char-split',
    agentTodoImportFromDisk: true,
  },
  'markdown-answer': {
    label: 'GFM markdown in assistant answer',
    turns: [markdownAnswerTurnEvents()],
  },
}

export function getScenario(name: ScenarioName): ScenarioDefinition {
  return SCENARIOS[name]
}

export function listScenarioNames(): ScenarioName[] {
  return Object.keys(SCENARIOS) as ScenarioName[]
}

function resolveWorkspaceRoot(kind: 'edit-block' | 'tasks-seeded' | 'agent-todo-char-split'): string {
  if (kind === 'edit-block') return ensureEditBlockWorkspace()
  if (kind === 'agent-todo-char-split') return ensureAgentTodoCharSplitWorkspace()
  return ensureTasksSeededWorkspace()
}

/** Build {@link startMockSession} options for a named scenario. */
export function mockSessionForScenario(
  name: ScenarioName,
  extra: MockSessionOptions = {}
): MockSessionOptions {
  const def = getScenario(name)
  const core: MockCoreOptions = {
    messageTurns: def.turns,
    initialTodos: def.initialTodos,
    sessionTranscript: def.transcript,
    agentTodoImportFromDisk: def.agentTodoImportFromDisk,
  }
  if (def.workspace) {
    const root = resolveWorkspaceRoot(def.workspace)
    core.workspacePath = root
  }
  let tauri = extra.tauri
  const editBlockScenario =
    (name === 'proposed-edit' || name === 'applied-edit') && def.workspace === 'edit-block'
  if (editBlockScenario) {
    const root = ensureEditBlockWorkspace()
    const disk = fixtureDiskTauriHandlers(root)
    const extraHandlers =
      typeof extra.tauri === 'object' && extra.tauri.handlers ? extra.tauri.handlers : {}
    tauri = {
      ...(typeof extra.tauri === 'object' ? extra.tauri : {}),
      handlers: {
        ...disk,
        read_workspace_text_file: async () => E2E_EDIT_BLOCK_OLD,
        ...extraHandlers,
      },
    }
    core.filesInChat = [E2E_EDIT_BLOCK_REL]
  }
  if ((name === 'proposed-edit' || name === 'applied-edit') && !tauri) {
    tauri = true
  }
  return { ...extra, ...core, ...(tauri !== undefined ? { tauri } : {}) }
}

export function primeConfigForScenario(name: ScenarioName): Record<string, unknown> {
  const def = getScenario(name)
  return {
    autoLoadSession: def.config?.autoLoadSession ?? false,
    autoSaveSession: def.config?.autoSaveSession ?? false,
  }
}
