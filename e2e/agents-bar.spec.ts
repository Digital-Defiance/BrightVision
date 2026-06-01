import { expect, test } from '@playwright/test'
import { openChat, startMockSession } from './helpers/session'

test.describe('Cecli agents bar (roadmap #40)', () => {
  test('shows sub-agents from core API after session start', async ({ page }) => {
    await startMockSession(page)
    await openChat(page)

    const bar = page.getByTestId('chat-agent-bar')
    await expect(bar).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('subagent-chip-reviewer')).toBeVisible()
    await expect(page.getByTestId('subagent-chip-reviewer')).toContainText('reviewer')
  })

  test('Settings lists loaded sub-agents when session active', async ({ page }) => {
    await startMockSession(page)
    await page.getByTestId('nav-settings').click()
    await expect(page.getByText('Loaded for this session')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('strong').filter({ hasText: 'reviewer' })).toBeVisible()
  })
})
