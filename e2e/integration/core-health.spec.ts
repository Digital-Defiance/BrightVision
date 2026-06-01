import { expect, test } from '@playwright/test'
import {
  ensureIntegrationWorkspace,
  isIntegrationE2eEnabled,
  postImportAgentPlan,
  resetIntegrationCecliState,
  writeAgentTodoFile,
} from '../helpers/integrationEnv'
import { coreHealthUrl } from '../helpers/llmEnv'

test.describe('Real Vision API smoke', () => {
  test.skip(!isIntegrationE2eEnabled(), 'Run: yarn test:e2e:integration')

  test('health endpoint is ok', async () => {
    const res = await fetch(coreHealthUrl())
    expect(res.ok).toBe(true)
    const body = (await res.json()) as { status?: string }
    expect(body.status).toBe('ok')
  })

  test('creates session against integration workspace', async () => {
    const workspace = ensureIntegrationWorkspace()
    const res = await fetch('http://127.0.0.1:8741/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace,
        model: 'ollama_chat/llama3.2:3b',
        auto_yes: true,
      }),
    })
    const text = await res.text()
    expect(res.ok, text).toBe(true)
    const body = JSON.parse(text) as { session_id?: string }
    expect(body.session_id).toBeTruthy()
  })

  test('import-agent-plan HTTP with agent todo on disk', async () => {
    resetIntegrationCecliState()
    const workspace = ensureIntegrationWorkspace()
    writeAgentTodoFile(workspace, 'Remaining:\n→ API smoke task\n')
    const res = await postImportAgentPlan(workspace)
    const text = await res.text()
    expect(res.ok, text).toBe(true)
    const body = JSON.parse(text) as { todos?: { title?: string }[] }
    expect(body.todos?.length).toBeGreaterThan(0)
  })
})
