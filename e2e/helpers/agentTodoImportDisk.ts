import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { TodoStore } from '../../src/todos/types'
import { buildVisionCoreEnv, REPO_ROOT } from './llmEnv'

/**
 * Run real ``import_agent_plan_for_workspace`` (same as POST import-agent-plan / /agent sync).
 * Used by mocked e2e when the mock API should reflect on-disk agent todo.txt.
 */
export function importAgentPlanFromDisk(workspaceRoot: string): TodoStore {
  const python = path.join(REPO_ROOT, '.venv/bin/python3')
  if (!fs.existsSync(python)) {
    throw new Error(`E2E python not found: ${python} (run: source activate.sh)`)
  }
  const script = `
import json, sys
from bright_vision_core.agent_todos import import_agent_plan_for_workspace
from bright_vision_core.workspace_todos import WorkspaceTodos

ws = sys.argv[1]
store = import_agent_plan_for_workspace(ws)
api = WorkspaceTodos(ws)
disk = api.load()
print(json.dumps({
  "version": 1,
  "activeId": disk.active_id,
  "todos": [
    {
      "id": t.id,
      "title": t.title,
      "spec": t.spec,
      "requirements": t.requirements,
      "design": t.design,
      "tasks_md": t.tasks_md,
      "depends_on": list(t.depends_on),
      "branch": t.branch,
      "pr_url": t.pr_url,
      "status": t.status,
      "links": list(t.links),
      "checklist": [{"id": c.id, "text": c.text, "done": c.done} for c in t.checklist],
      "created_at": t.created_at,
      "updated_at": t.updated_at,
    }
    for t in disk.todos
  ],
  "templates": ["feature", "bugfix", "refactor", "spec-driven"],
}))
`.trim()
  const out = execFileSync(python, ['-c', script, workspaceRoot], {
    cwd: REPO_ROOT,
    env: buildVisionCoreEnv(),
    encoding: 'utf8',
  })
  return JSON.parse(out.trim()) as TodoStore
}
