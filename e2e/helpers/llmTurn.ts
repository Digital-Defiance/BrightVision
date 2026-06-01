import { expect, type Page } from '@playwright/test'

/** Dismiss confirm dialogs that block turn completion. */
export async function dismissConfirmIfPresent(page: Page) {
  const no = page.getByRole('button', { name: 'No' })
  if (await no.count()) {
    await no.first().click()
  }
}

async function turnIdle(page: Page): Promise<boolean> {
  await dismissConfirmIfPresent(page)
  const stop = await page.getByTestId('chat-stop-turn').count()
  const activity = await page.getByTestId('vision-activity').count()
  const inputEnabled = await page.getByTestId('chat-input').isEnabled()
  return stop === 0 && activity === 0 && inputEnabled
}

async function hasStallBanner(page: Page): Promise<boolean> {
  return (await page.getByText(/Turn stalled|likely stuck/i).count()) > 0
}

async function assistantReplyReady(page: Page): Promise<boolean> {
  const assistant = page.getByTestId('chat-message-assistant').first()
  if ((await assistant.count()) === 0) return false
  const text = (await assistant.innerText().catch(() => '')).trim()
  return text.length > 3
}

export type SettleTurnOptions = {
  /**
   * Model-router turns can stream an answer before SSE `done` (multi-hop / tail work).
   * After `postAnswerGraceMs`, pass when the reply is visible and there is no stall banner.
   */
  allowPostAnswerSettle?: boolean
  postAnswerGraceMs?: number
}

/**
 * Wait until stop button clears and chat is idle (handles trailing confirms).
 * Use `allowPostAnswerSettle` for router e2e after reply text is already asserted.
 */
export async function settleTurnAfterReply(
  page: Page,
  timeoutMs = 180_000,
  opts?: SettleTurnOptions
) {
  const allowPostAnswer = opts?.allowPostAnswerSettle ?? false
  const postAnswerGraceMs = opts?.postAnswerGraceMs ?? 90_000
  const started = Date.now()
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await turnIdle(page)) return
    if (
      allowPostAnswer &&
      !((await hasStallBanner(page))) &&
      (await assistantReplyReady(page)) &&
      Date.now() - started >= postAnswerGraceMs
    ) {
      return
    }
    await page.waitForTimeout(1500)
  }
  const stop = await page.getByTestId('chat-stop-turn').count()
  const activityText = (await page.getByTestId('vision-activity').innerText().catch(() => '')).trim()
  const inputEnabled = await page.getByTestId('chat-input').isEnabled().catch(() => false)
  const stalled = await hasStallBanner(page)
  throw new Error(
    `Turn did not settle within ${Math.round(timeoutMs / 1000)}s ` +
      `(stop=${stop}, activityVisible=${activityText ? 'yes' : 'no'}, ` +
      `inputEnabled=${inputEnabled}, stallHints=${stalled ? 1 : 0}). ` +
      `Activity: ${activityText || '(none)'}`
  )
}

/** Router lane: prefer full idle, but accept visible answer without stall after grace. */
export async function settleRouterTurnAfterReply(page: Page, timeoutMs = 180_000) {
  await settleTurnAfterReply(page, timeoutMs, {
    allowPostAnswerSettle: true,
    postAnswerGraceMs: 60_000,
  })
  await expect(page.getByText(/Turn stalled|likely stuck/i)).toHaveCount(0)
}
