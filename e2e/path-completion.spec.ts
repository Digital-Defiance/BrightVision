import { expect, test } from '@playwright/test'
import { sampleTodoStore } from './helpers/fixtures'
import { expectTasksListReady, openChat, openTasks, startMockSession } from './helpers/session'

test.describe('/add path Tab completion (mocked Tauri, roadmap #12)', () => {
  test('Tab completes workspace paths from complete_workspace_path', async ({ page }) => {
    await startMockSession(page, { tauri: true })
    await openChat(page)

    const input = page.getByTestId('chat-input')
    await input.fill('/add src')
    await page.waitForTimeout(200)
    await expect(page.getByTestId('path-suggestions')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('src/App.tsx')).toBeVisible()

    await input.press('Tab')
    await expect(input).toHaveValue(/\/add src\/App\.tsx\s*$/)
  })

  test('Tab completes paths in spec prompt (mocked Tauri)', async ({ page }) => {
    await startMockSession(page, { tauri: true, initialTodos: sampleTodoStore() })
    await openTasks(page)
    await expectTasksListReady(page)
    await page.getByTestId('todo-panel').getByRole('button', { name: 'First task' }).click()
    await page.getByRole('button', { name: 'Set active' }).click()
    await page.getByTestId('nav-spec').click()
    await expect(page.getByTestId('spec-agent-input')).toBeEnabled({ timeout: 10_000 })

    const input = page.getByTestId('spec-agent-input')
    await input.fill('/add src')
    await page.waitForTimeout(200)
    await expect(page.getByTestId('path-suggestions')).toBeVisible({ timeout: 5_000 })
    await input.press('Tab')
    await expect(input).toHaveValue(/\/add src\/App\.tsx\s*$/)
  })

  test('path list hidden on web without Tauri', async ({ page }) => {
    await startMockSession(page)
    await openChat(page)
    await page.getByTestId('chat-input').fill('/add src')
    await expect(page.getByTestId('path-suggestions')).toHaveCount(0)
  })
})
