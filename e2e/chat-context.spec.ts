import { expect, test } from '@playwright/test'
import { gotoVision } from './helpers/testConfig'
import { openChat, startMockSession } from './helpers/session'

test.describe('Chat context controls (roadmap #28)', () => {
  test('folder attach disabled without session', async ({ page }) => {
    await gotoVision(page)
    await openChat(page)
    const btn = page.getByLabel('Add folder to context')
    await expect(btn).toBeVisible()
    await expect(btn).toBeDisabled()
  })

  test('folder attach enabled after session start', async ({ page }) => {
    await startMockSession(page)
    await openChat(page)
    await expect(page.getByLabel('Add folder to context')).toBeEnabled()
  })
})
