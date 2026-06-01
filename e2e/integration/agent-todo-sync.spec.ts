import fs from 'node:fs'
import { expect, test } from '@playwright/test'
import { agentPlanTitleLooksValid } from '../helpers/agentTodoFixture'
import {
  ensureIntegrationWorkspace,
  integrationTodosPath,
  isIntegrationE2eEnabled,
  postImportAgentPlan,
  readIntegrationTodoStore,
  resetIntegrationCecliState,
  writeAgentTodoFile,
  writeCharSplitCorruptedAgentTodoFile,
} from '../helpers/integrationEnv'
import {
  openTasks,
  primeIntegrationApp,
  startIntegrationSession,
} from '../helpers/integrationSession'

test.describe.configure({ mode: 'serial' })

test.describe('Agent todo → Tasks (real core + real HTTP)', () => {
  test.skip(!isIntegrationE2eEnabled(), 'Run: yarn test:e2e:integration')

  test.beforeEach(() => {
    ensureIntegrationWorkspace()
    resetIntegrationCecliState()
  })

  test('import-agent-plan writes todos.json and Tasks tab lists checklist', async ({ page }) => {
    const workspace = ensureIntegrationWorkspace()
    writeAgentTodoFile(
      workspace,
      ['Remaining:', '→ Draft roadmap items in docs/ROADMAP.md', '○ Explore codebase', ''].join('\n')
    )

    await primeIntegrationApp(page)
    await startIntegrationSession(page)

    const importRes = await postImportAgentPlan(workspace)
    expect(importRes.ok, await importRes.text()).toBe(true)

    await openTasks(page)

    const taskRow = page.getByTestId('todo-panel').getByRole('button', {
      name: /Draft roadmap items in docs\/ROADMAP\.md/,
    })
    await expect(taskRow).toBeVisible({ timeout: 15_000 })
    await taskRow.click()
    await page.getByRole('tab', { name: 'Checklist' }).click()
    await expect(page.getByRole('textbox', { name: 'Acceptance item…' }).nth(1)).toHaveValue(
      'Explore codebase'
    )
    await expect(page.getByText('No tasks yet')).toHaveCount(0)

    expect(fs.existsSync(integrationTodosPath())).toBe(true)
    const store = readIntegrationTodoStore()
    expect(store?.todos?.length).toBeGreaterThan(0)
  })

  test('char-split agent todo after import shows real title in Tasks UI', async ({ page }) => {
    const workspace = ensureIntegrationWorkspace()
    writeCharSplitCorruptedAgentTodoFile(workspace, 'agent-char-split-ui')

    await primeIntegrationApp(page)
    await startIntegrationSession(page)

    const importRes = await postImportAgentPlan(workspace)
    expect(importRes.ok, await importRes.text()).toBe(true)

    await openTasks(page)

    const taskRow = page.getByTestId('todo-panel').getByRole('button', {
      name: /Explore the codebase/,
    })
    await expect(taskRow).toBeVisible({ timeout: 15_000 })
    await taskRow.click()
    await expect(page.getByLabel('Title')).toHaveValue(/Explore the codebase/)

    const store = readIntegrationTodoStore()
    expect(agentPlanTitleLooksValid(store?.todos?.[0]?.title)).toBe(true)
    expect(store?.todos?.[0]?.title).toContain('Explore the codebase')
  })
})
