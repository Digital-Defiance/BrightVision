import { expect, test } from '@playwright/test'
import type { TauriInvokeLog } from './helpers/mockTauri'
import { E2E_GIT_STATUS } from './helpers/tauriFixtures'
import { startMockSession } from './helpers/session'

test.describe('Tauri git panel (mocked invoke, roadmap #27)', () => {
  let invokeLog: TauriInvokeLog

  test.beforeEach(async ({ page }) => {
    const started = await startMockSession(page, { tauri: true })
    invokeLog = started.tauriMock!.getLog()
    invokeLog.commands.length = 0
    await page.getByTestId('nav-git').click()
    await expect(page.getByTestId('git-panel')).toBeVisible()
  })

  test('shows working tree instead of web-only hint', async ({ page }) => {
    await expect(page.getByTestId('git-panel-web-hint')).toHaveCount(0)
    await expect(page.getByText(E2E_GIT_STATUS.branch!)).toBeVisible()
    await expect(page.getByText('src/example.ts')).toBeVisible()
    await expect(page.getByTestId('git-commit-graph')).toBeVisible()
  })

  test('expands file diff and stages a single file', async ({ page }) => {
    invokeLog.commands.length = 0
    await page.getByText('README.md').click()
    await expect(page.getByText(/\+\+\+ b\//)).toBeVisible({ timeout: 10_000 })
    await page.getByLabel('Stage README.md').click()
    expect(invokeLog.commands).toContain('git_stage_paths')
  })

  test('stage all completes without error', async ({ page }) => {
    invokeLog.commands.length = 0
    await page.getByTestId('git-stage-all').click()
    await expect(page.getByTestId('git-stage-all')).toBeEnabled({ timeout: 10_000 })
    expect(invokeLog.commands).toContain('git_stage_paths')
  })
})
