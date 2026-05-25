import { expect, test } from '@playwright/test'
import { defaultTurnEvents } from './helpers/fixtures'
import { openChat, startMockSession } from './helpers/session'

test.describe('Chat UX (roadmap #1–2, #9–10, #13)', () => {
  test.beforeEach(async ({ page }) => {
    await startMockSession(page, { messageTurns: [defaultTurnEvents()] })
    await openChat(page)
  })

  test('assistant turn shows section chips and reply', async ({ page }) => {
    await page.getByTestId('chat-input').fill('Explain the module')
    await page.getByTestId('chat-send').click()

    await expect(page.getByText('Thinking', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Answer', { exact: true })).toBeVisible()
    await expect(page.getByText('Explain the module')).toBeVisible()
  })

  test('proposed edit accordion and applied label after done', async ({ page }) => {
    await page.getByTestId('chat-input').fill('Patch src/example.ts')
    await page.getByTestId('chat-send').click()

    await expect(page.getByText('Proposed only')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('src/example.ts').first()).toBeVisible()
  })

  test('token stats footer after turn', async ({ page }) => {
    await page.getByTestId('chat-input').fill('stats please')
    await page.getByTestId('chat-send').click()

    const stats = page.getByTestId('token-stats')
    await expect(stats).toBeVisible({ timeout: 15_000 })
    await expect(stats).toContainText('120 sent')
  })

  test('dismiss removes a chat bubble', async ({ page }) => {
    await page.getByTestId('chat-input').fill('hello-e2e-dismiss')
    await page.getByTestId('chat-send').click()
    await expect(page.getByText('hello-e2e-dismiss')).toBeVisible({ timeout: 15_000 })

    await page
      .locator('.MuiPaper-root')
      .filter({ hasText: 'hello-e2e-dismiss' })
      .last()
      .getByLabel('Dismiss message')
      .click()
    await expect(page.getByText('hello-e2e-dismiss')).toHaveCount(0)
  })
})
