import { expect, test } from '@playwright/test'
import { sampleTodoStore } from './helpers/fixtures'
import { openTasks, startMockSession } from './helpers/session'

test.describe('Tasks project steering (Kiro parity)', () => {
  test('shows missing steering and scaffolds template', async ({ page }) => {
    await startMockSession(page, { initialTodos: sampleTodoStore() })
    await openTasks(page)
    await expect(page.getByTestId('todo-new')).toBeEnabled({ timeout: 15_000 })
    await expect(page.getByTestId('steering-files-hint')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('steering-status-missing')).toBeVisible()
    await page.getByTestId('steering-scaffold').click()
    await expect(page.getByTestId('steering-status-active')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('steering-open-main')).toBeEnabled()
  })

  test('shows active when steering file exists', async ({ page }) => {
    await startMockSession(page, {
      initialTodos: sampleTodoStore(),
      steeringHasMain: true,
    })
    await openTasks(page)
    await expect(page.getByTestId('todo-new')).toBeEnabled({ timeout: 15_000 })
    await expect(page.getByTestId('steering-status-active')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('steering-scaffold')).toHaveCount(0)
  })
})
