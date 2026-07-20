import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from './llmEnv'

export interface ImplementMessagePreviewInput {
  workspace: string
  message: string
  store: {
    version: number
    activeId: string | null
    todos: Record<string, unknown>[]
  }
  injectTodoSpec?: boolean
  specFocus?: boolean
}

function resolvePython(): string {
  const venv = path.join(REPO_ROOT, '.venv', 'bin', 'python')
  if (fs.existsSync(venv)) return venv
  return 'python3'
}

/** Full Session inject path: ``build_user_message_with_spec_context`` (not block-only preview). */
export function previewImplementUserMessage(input: ImplementMessagePreviewInput): string {
  const script = `
import json, sys
from bright_vision_core.spec_focus import build_user_message_with_spec_context
from cecli.spec.todos import TodoStore

data = json.load(sys.stdin)
store = TodoStore.from_dict(data["store"])
item = next((t for t in store.todos if t.id == store.active_id), None)
text, _, _ = build_user_message_with_spec_context(
    data["workspace"],
    data["message"],
    item=item,
    store=store,
    focus_requested=bool(data.get("specFocus")),
    inject_todo_spec=bool(data.get("injectTodoSpec")),
)
print(text)
`
  return execFileSync(resolvePython(), ['-c', script], {
    input: JSON.stringify({
      workspace: input.workspace,
      message: input.message,
      store: input.store,
      injectTodoSpec: input.injectTodoSpec ?? false,
      specFocus: input.specFocus ?? false,
    }),
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: REPO_ROOT },
  })
}

/** Parse SSE body from Vision POST /messages into typed events. */
export function parseSseEvents(body: string): { type?: string; text?: string }[] {
  const out: { type?: string; text?: string }[] = []
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data: ')) continue
    try {
      out.push(JSON.parse(trimmed.slice(6)) as { type?: string; text?: string })
    } catch {
      // ignore partial chunks
    }
  }
  return out
}
