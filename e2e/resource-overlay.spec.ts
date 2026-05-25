import { expect, test } from '@playwright/test'
import { startMockSession } from './helpers/session'

test.describe('Resource overlay (#33)', () => {
  test('shows CPU/RAM/GPU HUD on desktop', async ({ page }) => {
    await startMockSession(page, { tauri: true })
    const overlay = page.getByTestId('resource-overlay')
    await expect(overlay).toBeVisible({ timeout: 5000 })
    await expect(overlay).toContainText('CPU')
    await expect(overlay).toContainText('RAM')
    await expect(overlay).toContainText('GPU')
  })
})
