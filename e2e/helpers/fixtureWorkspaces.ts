import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { TauriHandler } from './mockTauri'
import { resolveFixturePackRoot } from './llmEnv'
import { sampleTodoStore } from './fixtures'
import { writeCharSplitCorruptedAgentTodoFile } from './agentTodoFixture'

const FIXTURE_PACK_ROOT = resolveFixturePackRoot()

function workspaceRoot(name: string): string {
  return path.join(FIXTURE_PACK_ROOT, name)
}

export const CONTEXT_LLM_E2E_WORKSPACE = workspaceRoot('context-workspace')
export const HELLO_LLM_E2E_WORKSPACE = workspaceRoot('hello-workspace')
export const EDIT_BLOCK_WORKSPACE = workspaceRoot('edit-block-workspace')
export const TASKS_SEEDED_WORKSPACE = workspaceRoot('tasks-seeded-workspace')
export const AGENT_TODO_CHAR_SPLIT_WORKSPACE = workspaceRoot('agent-todo-char-split-workspace')

export const E2E_CONTEXT_MAGIC = 'bv-context-fixture-7f3a'
export const E2E_CONTEXT_WIDGET_REL = 'src/e2e_widget.ts'
export const E2E_EDIT_BLOCK_REL = 'src/patchme.ts'
export const E2E_EDIT_BLOCK_OLD = "export const value = 'old';\n"
export const E2E_EDIT_BLOCK_NEW = "export const value = 'new';\n"

function gitInitIfNeeded(root: string, addPaths: string[], message: string): void {
  fs.mkdirSync(root, { recursive: true })
  if (fs.existsSync(path.join(root, '.git'))) return
  execSync('git init -b main', { cwd: root, stdio: 'pipe' })
  if (addPaths.length) {
    execSync(`git add ${addPaths.map((p) => JSON.stringify(p)).join(' ')}`, {
      cwd: root,
      stdio: 'pipe',
    })
    execSync(`git -c user.email=e2e@test -c user.name=e2e commit -m ${JSON.stringify(message)}`, {
      cwd: root,
      stdio: 'pipe',
    })
  }
}

export function ensureContextLlmE2eWorkspace(): string {
  fs.mkdirSync(path.join(CONTEXT_LLM_E2E_WORKSPACE, 'src'), { recursive: true })
  const readme = path.join(CONTEXT_LLM_E2E_WORKSPACE, 'README.md')
  const widget = path.join(CONTEXT_LLM_E2E_WORKSPACE, E2E_CONTEXT_WIDGET_REL)
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(
      readme,
      '# E2E context workspace\n\nStable `E2E_CONTEXT_MAGIC` in src/e2e_widget.ts.\n',
      'utf8'
    )
  }
  if (!fs.existsSync(widget)) {
    fs.writeFileSync(
      widget,
      `export const E2E_CONTEXT_MAGIC = '${E2E_CONTEXT_MAGIC}'\n`,
      'utf8'
    )
  }
  gitInitIfNeeded(CONTEXT_LLM_E2E_WORKSPACE, ['README.md', E2E_CONTEXT_WIDGET_REL], 'e2e context')
  return CONTEXT_LLM_E2E_WORKSPACE
}

export function ensureHelloLlmE2eWorkspace(): string {
  fs.mkdirSync(HELLO_LLM_E2E_WORKSPACE, { recursive: true })
  const readme = path.join(HELLO_LLM_E2E_WORKSPACE, 'README.md')
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, '# E2E hello workspace\n', 'utf8')
  }
  gitInitIfNeeded(HELLO_LLM_E2E_WORKSPACE, ['README.md'], 'e2e hello')
  return HELLO_LLM_E2E_WORKSPACE
}

/** Disk content for proposed-edit apply e2e (SEARCH `old` → `new`). */
export function ensureEditBlockWorkspace(): string {
  fs.mkdirSync(path.join(EDIT_BLOCK_WORKSPACE, 'src'), { recursive: true })
  const readme = path.join(EDIT_BLOCK_WORKSPACE, 'README.md')
  const patch = path.join(EDIT_BLOCK_WORKSPACE, E2E_EDIT_BLOCK_REL)
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, '# E2E edit-block workspace\n', 'utf8')
  }
  fs.writeFileSync(patch, E2E_EDIT_BLOCK_OLD, 'utf8')
  gitInitIfNeeded(EDIT_BLOCK_WORKSPACE, ['README.md', E2E_EDIT_BLOCK_REL], 'e2e edit-block')
  return EDIT_BLOCK_WORKSPACE
}

/** Workspace with committed `.cecli/todos.json` for Tasks / HTTP tests. */
export function ensureTasksSeededWorkspace(): string {
  fs.mkdirSync(TASKS_SEEDED_WORKSPACE, { recursive: true })
  const readme = path.join(TASKS_SEEDED_WORKSPACE, 'README.md')
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, '# E2E tasks-seeded workspace\n', 'utf8')
  }
  const cecli = path.join(TASKS_SEEDED_WORKSPACE, '.cecli')
  fs.mkdirSync(cecli, { recursive: true })
  fs.writeFileSync(
    path.join(cecli, 'todos.json'),
    JSON.stringify(sampleTodoStore(), null, 2),
    'utf8'
  )
  gitInitIfNeeded(
    TASKS_SEEDED_WORKSPACE,
    ['README.md', '.cecli/todos.json'],
    'e2e tasks-seeded'
  )
  return TASKS_SEEDED_WORKSPACE
}

/** Git workspace with char-split agent todo.txt (post-/agent UpdateTodoList quirk). */
export function ensureAgentTodoCharSplitWorkspace(): string {
  fs.mkdirSync(AGENT_TODO_CHAR_SPLIT_WORKSPACE, { recursive: true })
  const readme = path.join(AGENT_TODO_CHAR_SPLIT_WORKSPACE, 'README.md')
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, '# E2E agent todo char-split workspace\n', 'utf8')
  }
  gitInitIfNeeded(AGENT_TODO_CHAR_SPLIT_WORKSPACE, ['README.md'], 'e2e agent-todo-char-split')
  const cecli = path.join(AGENT_TODO_CHAR_SPLIT_WORKSPACE, '.cecli')
  if (fs.existsSync(cecli)) fs.rmSync(cecli, { recursive: true })
  writeCharSplitCorruptedAgentTodoFile(AGENT_TODO_CHAR_SPLIT_WORKSPACE, 'agent-char-split')
  return AGENT_TODO_CHAR_SPLIT_WORKSPACE
}

/** Tauri handlers that read/write real files under a fixture workspace. */
export function fixtureDiskTauriHandlers(root: string): Record<string, TauriHandler> {
  return {
    detect_workspace: async () => root,
    read_workspace_text_file: async (args) => {
      const rel = String((args as { path?: string }).path ?? '').replace(/^\.\//, '')
      const full = path.join(root, rel)
      if (!fs.existsSync(full)) throw new Error(`fixture missing: ${rel}`)
      return fs.readFileSync(full, 'utf8')
    },
    write_workspace_text_file: async (args) => {
      const rel = String((args as { path?: string }).path ?? '').replace(/^\.\//, '')
      const full = path.join(root, rel)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, String((args as { content?: string }).content ?? ''), 'utf8')
    },
  }
}
