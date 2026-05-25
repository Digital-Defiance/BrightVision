import { expect, test } from '@playwright/test'
import { confirmTurnEvents } from './helpers/fixtures'
import { openChat, startMockSession } from './helpers/session'

test.describe('Confirm flow (roadmap #7)', () => {
  test('yes and no answers dismiss the banner', async ({ page }) => {
    await startMockSession(page, {
      messageTurns: [confirmTurnEvents(), confirmTurnEvents()],
    })
    await openChat(page)

    await page.getByTestId('chat-input').fill('apply patch')
    await page.getByTestId('chat-send').click()

    const banner = page.getByTestId('confirm-banner')
    await expect(banner).toBeVisible({ timeout: 15_000 })
    await expect(banner).toContainText('Apply changes to src/example.ts')

    await banner.getByRole('button', { name: 'No' }).click()
    await expect(banner).toHaveCount(0)
    await expect(page.getByTestId('chat-send')).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('chat-input').fill('again')
    await page.getByTestId('chat-send').click()
    await expect(banner).toBeVisible({ timeout: 15_000 })
    await banner.getByRole('button', { name: 'Yes' }).click()
    await expect(banner).toHaveCount(0)
  })
})
