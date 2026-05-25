import { expect, test } from '@playwright/test'
import { gotoVision } from './helpers/testConfig'

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await gotoVision(page)
  })

  test('shows chat nav by default', async ({ page }) => {
    await expect(page.getByTestId('nav-chat')).toBeVisible()
  })

  test('git tab shows desktop-only hint on web', async ({ page }) => {
    await page.getByTestId('nav-git').click()
    await expect(page.getByTestId('git-panel')).toBeVisible()
    await expect(page.getByTestId('git-panel-web-hint')).toContainText('desktop app')
  })

  test('settings tab loads commit controls', async ({ page }) => {
    await page.getByTestId('nav-settings').click()
    await expect(page.getByLabel('Prompt before commit')).toBeVisible()
    await expect(page.getByLabel('Auto-stage edits after turn')).toBeVisible()
  })

  test('tasks tab renders', async ({ page }) => {
    await page.getByTestId('nav-tasks').click()
    await expect(page.getByText('Tasks', { exact: true }).first()).toBeVisible()
  })

  test('terminal tab renders start control', async ({ page }) => {
    await page.getByTestId('nav-terminal').click()
    await expect(page.getByTestId('terminal-start')).toBeVisible()
  })
})
