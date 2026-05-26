import { expect, test } from '@playwright/test'
import { gotoVision } from './helpers/testConfig'

test.describe('Model router (#39)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoVision(page)
    await page.getByTestId('nav-settings').click()
  })

  test('hopper and router bar settings', async ({ page }) => {
    await expect(page.getByTestId('model-router-settings')).toBeVisible()
    await page.getByTestId('pref-model-router-enabled').click()
    await page.getByTestId('model-hopper-enable-hopper-fast-deepseek').click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Settings saved')).toBeVisible()
  })
})
