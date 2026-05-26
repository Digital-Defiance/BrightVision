import { expect, test } from '@playwright/test'
import { gotoVision } from './helpers/testConfig'

test.describe('Editor language plugins (#38 v3)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoVision(page)
    await page.getByTestId('nav-settings').click()
  })

  test('settings lists allowlisted optional packs', async ({ page }) => {
    await expect(page.getByTestId('editor-languages-settings')).toBeVisible()
    await expect(page.getByTestId('editor-lang-plugin-cpp')).toBeVisible()
    await expect(page.getByTestId('editor-lang-plugin-java')).toBeVisible()
    await expect(page.getByText(/allowlisted CodeMirror packages/i)).toBeVisible()
  })

  test('model hopper shows enable switches', async ({ page }) => {
    await expect(page.getByTestId('model-hopper-editor')).toBeVisible()
    await expect(page.getByTestId('model-hopper-enable-hopper-fast-deepseek')).toBeVisible()
  })

  test('toggling cpp pack persists after save', async ({ page }) => {
    await page.getByTestId('editor-lang-plugin-cpp').click()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Settings saved')).toBeVisible()

    await page.reload()
    await page.getByTestId('nav-settings').click()
    const toggle = page.getByTestId('editor-lang-plugin-cpp').locator('input')
    await expect(toggle).toBeChecked()
  })
})
