import { expect, test } from '@playwright/test'
import {
  agentTodoWithStep1Done,
  SPEC_PROGRESS_STEP1,
  specProgressTodoStoreJson,
} from '../helpers/specProgressFixture'
import { writeAgentTodoFile } from '../helpers/agentTodoFixture'
import {
  ensureIntegrationWorkspace,
  isIntegrationE2eEnabled,
  patchIntegrationTodo,
  postImportAgentPlan,
  readIntegrationTodoStore,
  resetIntegrationCecliState,
  writeIntegrationTodoStore,
} from '../helpers/integrationEnv'
import { openTasks, primeIntegrationApp, startIntegrationSession } from '../helpers/integrationSession'

test.describe.configure({ mode: 'serial' })

test.describe('Spec implementation progress (real core + HTTP)', () => {
  test.skip(!isIntegrationE2eEnabled(), 'Run: yarn test:e2e:integration')

  test.beforeEach(() => {
    ensureIntegrationWorkspace()
    resetIntegrationCecliState()
  })

  test('PATCH tasks_md materializes checklist when empty', async () => {
    const workspace = ensureIntegrationWorkspace()
    const store = specProgressTodoStoreJson('patch-materialize')
    store.todos[0]!.checklist = []
    store.todos[0]!.tasks_md = ''
    writeIntegrationTodoStore(store)

    const res = await patchIntegrationTodo(workspace, 'patch-materialize', {
      tasks_md: specProgressTodoStoreJson().todos[0]!.tasks_md,
    })
    const text = await res.text()
    expect(res.ok, text).toBe(true)
    const body = JSON.parse(text) as { item?: { checklist?: { text?: string }[] } }
    expect(body.item?.checklist?.length).toBe(2)
    expect(body.item?.checklist?.[0]?.text).toContain('REQ-001')
  })

  test('import-agent-plan merges agent done into preserved spec tasks_md', async () => {
    const workspace = ensureIntegrationWorkspace()
    writeIntegrationTodoStore(specProgressTodoStoreJson())
    writeAgentTodoFile(workspace, agentTodoWithStep1Done(), 'spec-progress')

    const res = await postImportAgentPlan(workspace)
    const text = await res.text()
    expect(res.ok, text).toBe(true)
    const body = JSON.parse(text) as {
      todos?: { tasks_md?: string; checklist?: { done?: boolean; text?: string }[] }[]
    }
    const item = body.todos?.[0]
    expect(item?.tasks_md).toContain('- [x] 1. Wire generate-spec')
    expect(item?.tasks_md).toContain('REQ-001')
    expect(item?.tasks_md).toContain('- [ ] 2. Add tests')
    expect(item?.checklist?.[0]?.done).toBe(true)
    expect(item?.checklist?.[1]?.done).toBe(false)

    const onDisk = readIntegrationTodoStore()
    expect(onDisk?.todos?.[0]?.tasks_md).toContain('- [x] 1. Wire generate-spec')
  })

  test('Tasks UI shows merged checklist after import', async ({ page }) => {
    const workspace = ensureIntegrationWorkspace()
    writeIntegrationTodoStore(specProgressTodoStoreJson())
    writeAgentTodoFile(workspace, agentTodoWithStep1Done(), 'spec-progress-ui')

    await primeIntegrationApp(page)
    await startIntegrationSession(page)

    const importRes = await postImportAgentPlan(workspace)
    expect(importRes.ok, await importRes.text()).toBe(true)

    await openTasks(page)
    await page.getByTestId('todo-panel').getByRole('button', { name: /Spec progress feature/ }).click()
    await page.getByRole('tab', { name: 'Checklist' }).click()

    const first = page.getByRole('textbox', { name: 'Acceptance item…' }).first()
    await expect(first).toHaveValue(new RegExp(SPEC_PROGRESS_STEP1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    await page.getByTestId('todo-panel').getByRole('tab', { name: 'Tasks' }).click()
    await expect(page.getByLabel('Implementation tasks')).toContainText('- [x] 1. Wire generate-spec')
  })
})
