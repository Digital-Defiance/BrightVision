import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CHAR_SPLIT_AGENT_TODO_JSON,
  writeAgentTodoFile,
  writeCharSplitCorruptedAgentTodoFile,
} from './agentTodoFixture'
import { buildVisionCoreEnv, REPO_ROOT } from './llmEnv'

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url))

/** Git workspace for real-core Playwright integration (no mocked /api/core). */
export const INTEGRATION_WORKSPACE = path.join(REPO_ROOT, 'e2e/fixtures/integration-workspace')

export { CHAR_SPLIT_AGENT_TODO_JSON, writeAgentTodoFile, writeCharSplitCorruptedAgentTodoFile }

export function isIntegrationE2eEnabled(): boolean {
  return process.env.E2E_INTEGRATION === '1'
}

export function ensureIntegrationWorkspace(): string {
  fs.mkdirSync(INTEGRATION_WORKSPACE, { recursive: true })
  const readme = path.join(INTEGRATION_WORKSPACE, 'README.md')
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, '# E2E integration workspace\n', 'utf8')
  }
  if (!fs.existsSync(path.join(INTEGRATION_WORKSPACE, '.git'))) {
    execSync(
      'git init -b main && git add README.md && git -c user.email=e2e@test -c user.name=e2e commit -m "e2e init"',
      { cwd: INTEGRATION_WORKSPACE, stdio: 'pipe' }
    )
  }
  return INTEGRATION_WORKSPACE
}

export function integrationTodosPath(): string {
  return path.join(INTEGRATION_WORKSPACE, '.cecli', 'todos.json')
}

/** Remove agent todos + workspace store so integration specs do not share state. */
export function resetIntegrationCecliState(): void {
  const cecli = path.join(INTEGRATION_WORKSPACE, '.cecli')
  if (fs.existsSync(cecli)) {
    fs.rmSync(cecli, { recursive: true, force: true })
  }
}

export function readIntegrationTodoStore(): { todos?: { title?: string }[] } | null {
  const p = integrationTodosPath()
  if (!fs.existsSync(p)) return null
  return JSON.parse(fs.readFileSync(p, 'utf8')) as { todos?: { title?: string }[] }
}

export function buildIntegrationAppConfig() {
  return {
    model: 'ollama_chat/llama3.2:3b',
    ollamaApiBase: 'http://127.0.0.1:11434',
    localLlmRoot: '',
    manageLocalLlm: false,
    extraParams: '{}',
    workingDir: ensureIntegrationWorkspace(),
    autoApproveLimit: 0,
    promptBeforeCommit: true,
    autoStageOnDone: false,
    coreEnginePath: '.',
    pythonPath: '',
    coreApiUrl: '/api/core',
    coreApiToken: '',
    contextFiles: [] as string[],
  }
}

/** Direct HTTP to real Vision API (bypasses browser). */
export async function postImportAgentPlan(workspace: string): Promise<Response> {
  const qs = new URLSearchParams({ workspace })
  return fetch(`http://127.0.0.1:8741/workspaces/todos/import-agent-plan?${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
}

export { REPO_ROOT, buildVisionCoreEnv }
