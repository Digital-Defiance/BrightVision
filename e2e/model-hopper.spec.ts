import { expect, test } from '@playwright/test'
import { gotoVision } from './helpers/testConfig'

test.describe('Model hopper (#39)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoVision(page)
    await page.getByTestId('nav-settings').click()
  })

  test('hopper lists models with enable toggles', async ({ page }) => {
    await expect(page.getByTestId('model-router-settings')).toBeVisible()
    await expect(page.getByTestId('model-hopper-editor')).toBeVisible()
    await expect(page.getByTestId('model-route-tier-legend')).toBeVisible()
    await page.getByTestId('pref-model-router-enabled').click()
    await expect(page.getByTestId('model-hopper-enable-hopper-fast-deepseek')).toBeVisible()
    await expect(page.getByTestId('model-hopper-thinking-hopper-fast-deepseek')).toBeVisible()
    await expect(page.getByTestId('model-hopper-extra-hopper-fast-deepseek')).toBeVisible()
    await page.getByRole('button', { name: 'Add code slot' }).click()
    await page.getByRole('button', { name: 'Add think slot' }).click()
    await expect(page.locator('[data-testid^="model-hopper-row-"]')).toHaveCount(5)
  })
})
