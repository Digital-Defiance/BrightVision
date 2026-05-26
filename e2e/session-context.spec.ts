import { expect, test } from '@playwright/test'
import { defaultTurnEvents } from './helpers/fixtures'
import { openChat, startMockSession } from './helpers/session'

test.describe('Session context chip (files + usage)', () => {
  test('shows token usage after turn', async ({ page }) => {
    await startMockSession(page, { messageTurns: [defaultTurnEvents()] })
    await openChat(page)
    await page.getByTestId('chat-input').fill('hello context')
    await page.getByTestId('chat-send').click()
    await expect(page.getByTestId('session-context-chip')).toContainText('120 sent', {
      timeout: 15_000,
    })
  })

  test('file counter updates after /add via chat', async ({ page }) => {
    await startMockSession(page, {
      messageTurns: [[{ type: 'done', edited_files: [] }]],
    })
    await openChat(page)

    const chip = page.getByTestId('session-context-chip')
    await page.getByTestId('chat-input').fill('/add src/utils/contextUsage.ts')
    await page.getByTestId('chat-send').click()

    await expect(chip).toContainText('1 file', { timeout: 15_000 })
  })

  test('clicking context chip lists files in chat', async ({ page }) => {
    await startMockSession(page, {
      messageTurns: [[{ type: 'done', edited_files: [] }]],
    })
    await openChat(page)

    await page.getByTestId('chat-input').fill('/add src/utils/contextUsage.ts')
    await page.getByTestId('chat-send').click()
    await expect(page.getByTestId('session-context-chip')).toContainText('1 file', {
      timeout: 15_000,
    })

    await page.getByTestId('session-context-chip').click()
    const popover = page.getByTestId('session-context-popover')
    await expect(popover).toBeVisible()
    await expect(popover).toContainText('src/utils/contextUsage.ts')
  })
})
