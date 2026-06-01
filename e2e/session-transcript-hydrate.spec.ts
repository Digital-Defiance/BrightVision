import { expect, test } from '@playwright/test'
import { openChat, startMockSession } from './helpers/session'

/** Roadmap #33 — UI mirrors cecli history after auto-load (mocked transcript API). */
test.describe('Session transcript hydrate', () => {
  test('auto-load shows prior bubbles on session start', async ({ page }) => {
    await startMockSession(page, { scenario: 'session-transcript' })
    await openChat(page)
    await expect(page.getByText('prior user turn from saved session')).toBeVisible()
    await expect(page.getByText('prior assistant reply from saved session')).toBeVisible()
  })
})
