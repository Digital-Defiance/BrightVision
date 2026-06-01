import { expect, test } from '@playwright/test'
import { expectOptimisticSend } from './helpers/chatSend'
import {
  defaultTurnEvents,
  hangingTurnEvents,
  markdownAnswerTurnEvents,
  proposedEditTurnEvents,
} from './helpers/fixtures'
import { openChat, startMockSession } from './helpers/session'

test.describe('Chat UX (roadmap #1–2, #9–10, #13)', () => {
  test.beforeEach(async ({ page }) => {
    await startMockSession(page, { messageTurns: [defaultTurnEvents()] })
    await openChat(page)
  })

  test('assistant prose renders markdown (lists, bold, inline code)', async ({ page }) => {
    await startMockSession(page, { messageTurns: [markdownAnswerTurnEvents()] })
    await openChat(page)
    await page.getByTestId('chat-input').fill('what is next')
    await page.getByTestId('chat-send').click()

    const md = page.getByTestId('chat-markdown').filter({ hasText: 'Open Items' })
    await expect(md).toBeVisible({ timeout: 15_000 })
    await expect(md.locator('strong', { hasText: 'Open Items' })).toBeVisible()
    await expect(md.getByRole('listitem').filter({ hasText: '#21' })).toBeVisible()
    await expect(md.locator('code', { hasText: 'yarn dogfood:agent' })).toBeVisible()
  })

  test('assistant turn shows section chips and reply', async ({ page }) => {
    await page.getByTestId('chat-input').fill('Explain the module')
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, 'Explain the module')

    await expect(page.getByText('Thinking', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Answer', { exact: true })).toBeVisible()
    await expect(page.getByText('Explain the module')).toBeVisible()
  })

  test('proposed edit accordion when engine has not applied yet', async ({ page }) => {
    await startMockSession(page, { messageTurns: [proposedEditTurnEvents()] })
    await openChat(page)
    await page.getByTestId('chat-input').fill('Patch src/example.ts')
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, 'Patch src/example.ts')

    await expect(page.getByText('Proposed only')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('src/example.ts').first()).toBeVisible()
  })

  test('thinking timer visible during turn', async ({ page }) => {
    await startMockSession(page, { messageTurns: [hangingTurnEvents()] })
    await openChat(page)
    await page.getByTestId('chat-input').fill('think about this')
    await page.getByTestId('chat-send').click()
    await expect(page.getByTestId('vision-activity')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('thinking-timer')).toBeVisible()
    await expect(page.getByTestId('thinking-timer')).toContainText('Response')
    await expect(page.getByTestId('thinking-timer')).toContainText('Think')
  })

  test('token stats footer after turn', async ({ page }) => {
    await page.getByTestId('chat-input').fill('stats please')
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, 'stats please')

    const stats = page.getByTestId('token-stats')
    await expect(stats).toBeVisible({ timeout: 15_000 })
    await expect(stats).toContainText('120 sent')
  })

  test('dismiss removes a chat bubble', async ({ page }) => {
    await page.getByTestId('chat-input').fill('hello-e2e-dismiss')
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, 'hello-e2e-dismiss')

    await page
      .getByTestId('chat-message-user')
      .filter({ hasText: 'hello-e2e-dismiss' })
      .getByLabel('Dismiss message')
      .click()
    await expect(page.getByText('hello-e2e-dismiss')).toHaveCount(0)
  })

  test('clear history removes transcript after confirm', async ({ page }) => {
    await page.getByTestId('chat-input').fill('hello-e2e-clear-all')
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, 'hello-e2e-clear-all')
    await expect(page.getByText('hello-e2e-clear-all')).toBeVisible()

    const clearBtn = page.getByTestId('chat-clear-history')
    await expect(clearBtn).toBeEnabled()

    const clearCore = page.waitForRequest(
      (req) =>
        req.method() === 'POST' &&
        req.url().includes('/messages') &&
        (req.postDataJSON() as { content?: string })?.content === '/clear'
    )

    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm')
      expect(dialog.message()).toMatch(/send \/clear/i)
      await dialog.accept()
    })
    await clearBtn.click()
    await clearCore

    await expect(page.getByText('hello-e2e-clear-all')).toHaveCount(0)
    await expect(clearBtn).toBeDisabled()
  })

  test('clear history cancel keeps transcript', async ({ page }) => {
    await page.getByTestId('chat-input').fill('hello-e2e-clear-cancel')
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, 'hello-e2e-clear-cancel')
    await expect(page.getByText('hello-e2e-clear-cancel')).toBeVisible()

    page.once('dialog', (dialog) => dialog.dismiss())
    await page.getByTestId('chat-clear-history').click()

    await expect(page.getByText('hello-e2e-clear-cancel')).toBeVisible()
    await expect(page.getByTestId('chat-clear-history')).toBeEnabled()
  })
})
