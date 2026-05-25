import { expect, test } from '@playwright/test'
import { installMockCoreApi } from './helpers/mockCoreApi'
import { gotoVision, openSettings } from './helpers/session'
import { E2E_CONFIG, E2E_CONFIG_STORAGE_KEY } from './helpers/testConfig'

test.describe('Settings (roadmap #17, #28 persistence)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoVision(page)
    await openSettings(page)
  })

  test('prompt before commit persists in localStorage', async ({ page }) => {
    await page.getByLabel('Prompt before commit').selectOption('yes')
    await page.getByRole('button', { name: 'Save' }).click()
    const stored = await page.evaluate((key) => localStorage.getItem(key), E2E_CONFIG_STORAGE_KEY)
    expect(stored).toContain('"promptBeforeCommit":true')
  })

  test('auto-stage toggle persists', async ({ page }) => {
    await page.getByLabel('Auto-stage edits after turn').selectOption('no')
    await page.getByRole('button', { name: 'Save' }).click()
    const stored = await page.evaluate((key) => localStorage.getItem(key), E2E_CONFIG_STORAGE_KEY)
    expect(stored).toContain('"autoStageOnDone":false')
  })

  test('session create sends auto_commits false when prompt before commit', async ({ page }) => {
    let autoCommits: boolean | undefined
    await page.addInitScript((cfg) => {
      localStorage.setItem('vision-welcome-dismissed', '1')
      localStorage.setItem(
        'bright-vision-config',
        JSON.stringify({ ...cfg, promptBeforeCommit: true })
      )
    }, E2E_CONFIG)
    await installMockCoreApi(page, {
      onSessionCreate: (body) => {
        autoCommits = body.auto_commits as boolean | undefined
      },
    })
    await page.goto('/')
    await page.getByTestId('nav-terminal').click()
    await page.getByTestId('terminal-start').click()
    await expect(page.getByTestId('session-status')).toContainText('Session active', {
      timeout: 15_000,
    })
    expect(autoCommits).toBe(false)
  })
})
