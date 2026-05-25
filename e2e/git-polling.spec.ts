import { expect, test } from '@playwright/test'
import { GIT_STATUS_POLL_MS } from '../src/hooks/useGitStatus'
import { startMockSession } from './helpers/session'

test.describe('Git status polling (roadmap #26 partial)', () => {
  test.setTimeout(90_000)

  test('polls git_workspace_status while session runs', async ({ page }) => {
    const { tauriMock } = await startMockSession(page, { tauri: true })
    expect(tauriMock).toBeDefined()
    tauriMock!.resetLog()

    await page.waitForTimeout(GIT_STATUS_POLL_MS * 2 + 2_000)

    const statusCalls = tauriMock!.getLog().commands.filter((c) => c === 'git_workspace_status')
    expect(statusCalls.length).toBeGreaterThanOrEqual(2)
  })

  test('polls while Git tab is open', async ({ page }) => {
    const { tauriMock } = await startMockSession(page, { tauri: true })
    tauriMock!.resetLog()
    await page.getByTestId('nav-git').click()
    await expect(page.getByTestId('git-panel')).toBeVisible()

    await page.waitForTimeout(GIT_STATUS_POLL_MS * 2 + 2_000)

    const statusCalls = tauriMock!.getLog().commands.filter((c) => c === 'git_workspace_status')
    expect(statusCalls.length).toBeGreaterThanOrEqual(2)
  })
})
