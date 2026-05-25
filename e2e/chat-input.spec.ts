import { expect, test } from '@playwright/test'
import { hangingTurnEvents } from './helpers/fixtures'
import { openChat, startMockSession } from './helpers/session'

test.describe('Chat input & session control (roadmap #3–5)', () => {
  test('queue follow-up while agent is busy', async ({ page }) => {
    await startMockSession(page, {
      messageTurns: [hangingTurnEvents()],
      messageDelayMs: 120_000,
    })
    await openChat(page)

    await page.getByTestId('chat-input').fill('first message')
    await page.getByTestId('chat-send').click()

    await expect(page.getByTestId('chat-queue')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('chat-input').fill('queued follow-up')
    await page.getByTestId('chat-queue').click()

    await expect(page.getByText(/1 message queued/i)).toBeVisible()
    await page.getByTestId('chat-stop-turn').click({ force: true })
  })

  test('stop cancels in-flight turn', async ({ page }) => {
    await startMockSession(page, {
      messageTurns: [hangingTurnEvents()],
      messageDelayMs: 120_000,
    })
    await openChat(page)

    await page.getByTestId('chat-input').fill('long task')
    await page.getByTestId('chat-send').click()
    const stop = page.getByTestId('chat-stop-turn')
    await expect(stop).toBeVisible({ timeout: 10_000 })
    await stop.click({ force: true })

    await expect(page.getByTestId('chat-send')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('chat-stop-turn')).toHaveCount(0)
  })

  test('multiline input keeps newline without sending', async ({ page }) => {
    await startMockSession(page)
    await openChat(page)

    const input = page.getByTestId('chat-input')
    await input.fill('line one\nline two')
    await expect(input).toHaveValue('line one\nline two')
    await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled()
    await expect(page.getByText('line one', { exact: true })).toHaveCount(0)
  })
})
