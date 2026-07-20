import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from './llmEnv'

export interface ImplementBlockPreviewInput {
  workspace: string
  checklist: { id: string; text: string; done: boolean }[]
  resume?: boolean
  activeTaskTitle?: string
  message?: string
}

function resolvePython(): string {
  const venv = path.join(REPO_ROOT, '.venv', 'bin', 'python')
  if (fs.existsSync(venv)) return venv
  return 'python3'
}

/** Run cecli implement inject against a fixture workspace (no LLM). */
export function previewImplementBlock(input: ImplementBlockPreviewInput): string {
  const script = `
import json, sys
from bright_vision_core.implement_workspace import build_implement_workspace_block
from bright_vision_core.workspace_todos import ChecklistItem

data = json.load(sys.stdin)
checklist = [
    ChecklistItem(id=e["id"], text=e["text"], done=e["done"])
    for e in data["checklist"]
]
block = build_implement_workspace_block(
    data["workspace"],
    checklist,
    resume=data.get("resume", False),
    active_task_title=data.get("activeTaskTitle"),
    message=data.get("message"),
)
print(block)
`
  return execFileSync(resolvePython(), ['-c', script], {
    input: JSON.stringify({
      workspace: input.workspace,
      checklist: input.checklist,
      resume: input.resume ?? false,
      activeTaskTitle: input.activeTaskTitle,
      message: input.message,
    }),
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: REPO_ROOT },
  })
}
