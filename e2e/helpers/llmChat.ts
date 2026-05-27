import { expect, type Page } from '@playwright/test'

/** Fail fast when the core/agent path surfaces a known headless-args regression. */
export async function expectNoAgentVerboseCrash(page: Page) {
  await expect(page.getByText(/object has no attribute 'verbose'/i)).toHaveCount(0, {
    timeout: 15_000,
  })
  await expect(page.getByText(/Unable to complete agent.*verbose/i)).toHaveCount(0, {
    timeout: 15_000,
  })
}

/**
 * Wait for the latest assistant bubble with real reply text (not an empty placeholder).
 */
export async function expectLatestAssistantReply(
  page: Page,
  pattern: RegExp,
  timeoutMs: number
) {
  const assistant = page.getByTestId('chat-message-assistant').last()
  await expect(assistant).toBeVisible({ timeout: timeoutMs })
  await expect(assistant).toContainText(pattern, { timeout: timeoutMs })
  return assistant
}
