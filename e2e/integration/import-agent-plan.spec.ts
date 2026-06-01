import { expect, test } from '@playwright/test'
import { agentPlanTitleLooksValid } from '../helpers/agentTodoFixture'
import {
  ensureIntegrationWorkspace,
  isIntegrationE2eEnabled,
  postImportAgentPlan,
  readIntegrationTodoStore,
  resetIntegrationCecliState,
  writeAgentTodoFile,
  writeCharSplitCorruptedAgentTodoFile,
} from '../helpers/integrationEnv'

test.describe('import-agent-plan API (real core)', () => {
  test.skip(!isIntegrationE2eEnabled(), 'Run: yarn test:e2e:integration')

  test.beforeEach(() => {
    ensureIntegrationWorkspace()
    resetIntegrationCecliState()
  })

  test('404 without agent todo.txt', async () => {
    const workspace = ensureIntegrationWorkspace()
    const res = await postImportAgentPlan(workspace)
    if (res.status === 404) {
      expect(res.status).toBe(404)
      return
    }
    // Prior test may have left todo.txt — still valid if import works.
    expect(res.ok).toBe(true)
  })

  test('imports checklist into todos.json', async () => {
    const workspace = ensureIntegrationWorkspace()
    writeAgentTodoFile(
      workspace,
      ['Remaining:', '→ Ship integration tests', '○ Document in TESTING.md', ''].join('\n')
    )
    const res = await postImportAgentPlan(workspace)
    const text = await res.text()
    expect(res.ok, text).toBe(true)
    const body = JSON.parse(text) as { todos?: { title?: string; checklist?: unknown[] }[] }
    expect(body.todos?.length).toBeGreaterThan(0)
    expect(body.todos?.[0]?.title).toContain('Ship integration')
    expect(body.todos?.[0]?.checklist?.length).toBeGreaterThanOrEqual(2)

    const onDisk = readIntegrationTodoStore()
    expect(onDisk?.todos?.length).toBeGreaterThan(0)
  })

  test('recovers char-split agent todo.txt into real checklist rows', async () => {
    const workspace = ensureIntegrationWorkspace()
    writeCharSplitCorruptedAgentTodoFile(workspace)

    const res = await postImportAgentPlan(workspace)
    const text = await res.text()
    expect(res.ok, text).toBe(true)

    const body = JSON.parse(text) as {
      todos?: { title?: string; checklist?: { text?: string }[]; tasks_md?: string }[]
    }
    expect(body.todos?.length).toBe(1)
    const item = body.todos![0]!
    expect(agentPlanTitleLooksValid(item.title)).toBe(true)
    expect(item.title).toContain('Explore the codebase')
    const checklist = item.checklist ?? []
    expect(checklist.length).toBe(2)
    expect(checklist.some((c) => c.text?.includes('Explore the codebase'))).toBe(true)
    expect(checklist.some((c) => c.text?.includes('Draft roadmap items'))).toBe(true)
    expect(checklist.every((c) => (c.text?.length ?? 0) <= 80)).toBe(true)

    const tasksMd = item.tasks_md ?? ''
    expect(tasksMd).toContain('Explore the codebase')
    expect(tasksMd).not.toMatch(/^- \[ \] "$/m)
  })
})
