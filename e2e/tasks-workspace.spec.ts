import { expect, test } from '@playwright/test'
import { sampleTodoStore } from './helpers/fixtures'
import { openTasks, startMockSession } from './helpers/session'

test.describe('Tasks workspace (roadmap #18, charter § spec-driven)', () => {
  test.beforeEach(async ({ page }) => {
    await startMockSession(page, { initialTodos: sampleTodoStore() })
    await openTasks(page)
    await expect(page.getByTestId('todo-new')).toBeEnabled({ timeout: 15_000 })
    await expect(page.getByText('First task')).toBeVisible({ timeout: 10_000 })
  })

  test('lists tasks and shows blocked chip', async ({ page }) => {
    await page.getByText('Blocked successor').click()
    await expect(page.getByText('blocked', { exact: true })).toBeVisible()
  })

  test('creates a new task', async ({ page }) => {
    await page.getByTestId('todo-new').click()
    const row = page.getByText(/Task \d+/).first()
    await expect(row).toBeVisible({ timeout: 10_000 })
    await row.click()
    await expect(page.getByLabel('Title')).toHaveValue(/Task \d+/)
  })

  test('edits task title via editor', async ({ page }) => {
    await page.getByText('First task').click()
    const title = page.getByLabel('Title')
    const patch = page.waitForResponse(
      (res) =>
        res.request().method() === 'PATCH' &&
        res.url().includes('/api/core/workspaces/todos/task-a')
    )
    await title.fill('Renamed in e2e')
    await title.blur()
    await patch
    await expect(page.getByText('Renamed in e2e')).toBeVisible()
  })

  test('generate spec fills requirements (roadmap #18 v5)', async ({ page }) => {
    await page.getByText('First task').click()
    await expect(page.getByRole('button', { name: 'Generate spec' })).toBeEnabled({
      timeout: 10_000,
    })
    await page.getByRole('button', { name: 'Generate spec' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Run' }).click()
    await expect(page.getByText('Generated requirements')).toBeVisible({ timeout: 15_000 })
  })
})
