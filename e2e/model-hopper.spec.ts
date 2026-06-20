import { expect, test } from '@playwright/test'
import { gotoVision } from './helpers/testConfig'

test.describe('Model hopper (#39)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoVision(page)
    await page.getByTestId('nav-settings').click()
  })

  test('hopper lists models with enable toggles and add picker', async ({ page }) => {
    await expect(page.getByTestId('model-router-settings')).toBeVisible()
    await expect(page.getByTestId('model-hopper-editor')).toBeVisible()
    await expect(page.getByTestId('model-route-tier-legend')).toBeVisible()
    await page.getByTestId('pref-model-router-enabled').click()
    await expect(page.getByTestId('model-hopper-enable-hopper-fast-deepseek')).toBeVisible()
    await expect(page.getByTestId('model-hopper-thinking-hopper-fast-deepseek')).toBeVisible()
    await expect(page.getByTestId('model-hopper-extra-hopper-fast-deepseek')).toBeVisible()

    await expect(page.getByTestId('model-hopper-add-tier')).toBeVisible()
    await expect(page.getByTestId('model-hopper-add')).toBeVisible()

    const rowsBefore = page.locator('[data-testid^="model-hopper-row-"]')
    await expect(rowsBefore).toHaveCount(3)

    const addSelect = page.getByTestId('model-hopper-add')
    await addSelect.click()
    await page.getByRole('option', { name: /Custom — type model id manually/ }).click()

    await expect(rowsBefore).toHaveCount(4)
  })
})
