import { expect, test } from '@playwright/test'
import { sampleTodoStore } from './helpers/fixtures'
import { openChat, openTasks, startMockSession } from './helpers/session'
import { gotoVision } from './helpers/testConfig'

/**
 * Smoke checks for open / partial roadmap rows that are UI-visible on web.
 * See e2e/ROADMAP_COVERAGE.md for the full matrix.
 */
test.describe('Roadmap gaps (web smoke)', () => {
  test('#20–22 spec UX surfaces exist when session is live', async ({ page }) => {
    await startMockSession(page, { initialTodos: sampleTodoStore() })
    await openTasks(page)
    await page.getByText('First task').click()
    await expect(page.getByRole('button', { name: 'Generate spec' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Refine spec' })).toBeEnabled()
  })

  test('#26 git tab shows web partial state', async ({ page }) => {
    await gotoVision(page)
    await page.getByTestId('nav-git').click()
    await expect(page.getByTestId('git-panel-web-hint')).toBeVisible()
    await expect(page.getByTestId('git-commit-graph')).toHaveCount(0)
  })

  test('#28 context attach needs session', async ({ page }) => {
    await gotoVision(page)
    await openChat(page)
    await expect(page.getByLabel('Add folder to context')).toBeDisabled()
    await startMockSession(page)
    await openChat(page)
    await expect(page.getByLabel('Add folder to context')).toBeEnabled()
  })

  test('#30 web folder path dialog opens', async ({ page }) => {
    await startMockSession(page)
    await openChat(page)
    await page.getByLabel('Add folder to context').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Add folder to context' })).toBeVisible()
  })
})
