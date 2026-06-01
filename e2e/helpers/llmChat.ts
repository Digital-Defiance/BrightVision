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
 * Wait for an assistant bubble matching `pattern` (uses the last assistant message).
 */
export async function expectLatestAssistantReply(
  page: Page,
  pattern: RegExp,
  timeoutMs: number
) {
  const assistant = page.getByTestId('chat-message-assistant').last()
  const activity = page.getByTestId('vision-activity')
  try {
    await expect(assistant).toBeVisible({ timeout: timeoutMs })
    await expect(assistant).toContainText(pattern, { timeout: Math.min(120_000, timeoutMs) })
  } catch (err) {
    let extra = ''
    try {
      const activityText = (await activity.innerText()).trim()
      const stall = (await page.getByText(/Turn stalled|likely stuck/i).count()) > 0
      const slashTimeout =
        (await page.getByText(/slash commands timed out/i).count()) > 0
      extra =
        `Activity: ${activityText || '(none)'}\n` +
        (stall ? 'Session stall banner visible.\n' : '') +
        (slashTimeout
          ? 'Slash preproc timed out (try API lane with preproc:false or clear active todo).\n'
          : '')
    } catch {
      extra = '(page closed — likely hit Playwright test timeout)\n'
    }
    throw new Error(`${err instanceof Error ? err.message : String(err)}\n${extra}`)
  }
  return assistant
}
