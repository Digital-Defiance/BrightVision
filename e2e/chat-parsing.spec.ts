import { expect, test } from '@playwright/test'
import { expectOptimisticSend, expectTurnIdle } from './helpers/chatSend'
import { displayFenceTurnEvents, engineAppliedEditTurnEvents } from './helpers/fixtures'
import { openChat, startMockSession } from './helpers/session'

test.describe('Chat parsing (fences, applied edits, stream layout)', () => {
  test('plain ```python fence renders as display block not proposed edit', async ({ page }) => {
    await startMockSession(page, { messageTurns: [displayFenceTurnEvents()] })
    await openChat(page)

    await page.getByTestId('chat-input').fill('show python example')
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, 'show python example')

    const fence = page.getByTestId('chat-fence-block')
    await expect(fence).toBeVisible({ timeout: 15_000 })
    await expect(fence).toContainText('print("e2e-display-fence")')
    await expect(page.getByText('Proposed only')).toHaveCount(0)
    await expect(page.getByText('Applied', { exact: true })).toHaveCount(0)
  })

  test('done.edited_files shows Applied chip and edited file links', async ({ page }) => {
    await startMockSession(page, {
      messageTurns: [engineAppliedEditTurnEvents()],
      tauri: true,
    })
    await openChat(page)

    await page.getByTestId('chat-input').fill('Patch src/example.ts')
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, 'Patch src/example.ts')
    await expectTurnIdle(page, 30_000)

    await expect(page.getByText('Applied', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect(
      page.locator('.MuiAccordionSummary-root').filter({ hasText: 'src/example.ts' }).first()
    ).toBeVisible()
  })
})
