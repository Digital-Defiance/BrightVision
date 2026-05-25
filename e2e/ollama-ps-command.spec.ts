import { expect, test } from '@playwright/test'
import { openChat, startMockSession } from './helpers/session'

test.describe('Ollama client slash commands', () => {
  test('/ps shows table without calling core', async ({ page }) => {
    await startMockSession(page, { tauri: true })
    await openChat(page)

    let messagePosts = 0
    await page.route('**/api/core/sessions/*/messages', (route) => {
      if (route.request().method() === 'POST') messagePosts += 1
      return route.continue()
    })

    await page.getByTestId('chat-input').fill('/ps')
    await page.getByTestId('chat-send').click()

    await expect(page.getByTestId('ollama-status-message')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('ollama-models-table').first()).toBeVisible()
    await expect(page.getByRole('cell', { name: 'test/model' })).toBeVisible()
    expect(messagePosts).toBe(0)
  })
})
