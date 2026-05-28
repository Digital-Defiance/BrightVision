import { expect, type Page } from '@playwright/test'
import { expectTurnIdle } from './chatSend'

/** Dismiss confirm dialogs that block turn completion. */
export async function dismissConfirmIfPresent(page: Page) {
  const no = page.getByRole('button', { name: 'No' })
  if (await no.count()) {
    await no.first().click()
  }
}

/** Wait until stop button clears and chat is idle (handles trailing confirms). */
export async function settleTurnAfterReply(page: Page, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await dismissConfirmIfPresent(page)
    if ((await page.getByTestId('chat-stop-turn').count()) === 0) break
    await page.waitForTimeout(400)
  }
  const remaining = Math.max(5_000, deadline - Date.now())
  await expectTurnIdle(page, remaining)
}
