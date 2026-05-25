import { expect, type Page } from '@playwright/test'

/** After Send/Queue: input clears and user bubble appears before SSE may finish. */
export async function expectOptimisticSend(page: Page, text: string) {
  await expect(page.getByTestId('chat-input')).toHaveValue('', { timeout: 5_000 })
  await expect(
    page.getByTestId('chat-message-user').filter({ hasText: text })
  ).toBeVisible({ timeout: 5_000 })
}
