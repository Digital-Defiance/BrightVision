import { expect, test } from '@playwright/test'
import { openChat, startMockSession } from './helpers/session'

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

  test('path list hidden on web without Tauri', async ({ page }) => {
    await startMockSession(page)
    await openChat(page)
    await page.getByTestId('chat-input').fill('/add src')
    await expect(page.getByTestId('path-suggestions')).toHaveCount(0)
  })
})
