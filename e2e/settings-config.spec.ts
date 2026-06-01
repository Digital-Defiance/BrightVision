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

  test('session persistence toggles persist in localStorage', async ({ page }) => {
    await page.getByTestId('settings-session-encrypt').click()
    await page.getByTestId('settings-auto-save-session').click()
    await page.getByTestId('settings-auto-save-session-name').fill('e2e-session')
    await page.getByRole('button', { name: 'Save' }).click()
    const stored = await page.evaluate((key) => localStorage.getItem(key), E2E_CONFIG_STORAGE_KEY)
    expect(stored).toContain('"sessionEncrypt":true')
    expect(stored).toContain('"autoSaveSession":true')
    expect(stored).toContain('"autoSaveSessionName":"e2e-session"')
  })

  test('session create sends persistence flags to core API', async ({ page }) => {
    let body: Record<string, unknown> = {}
    await page.addInitScript((cfg) => {
      localStorage.setItem('vision-welcome-dismissed', '1')
      localStorage.setItem(
        'bright-vision-config',
        JSON.stringify({
          ...cfg,
          sessionEncrypt: true,
          autoSaveSession: true,
          autoLoadSession: false,
          autoSaveSessionName: 'e2e-api',
          chatHistoryFile: true,
        })
      )
    }, E2E_CONFIG)
    await installMockCoreApi(page, {
      onSessionCreate: (b) => {
        body = b
      },
    })
    await page.goto('/')
    await page.getByTestId('nav-terminal').click()
    await page.getByTestId('terminal-start').click()
    await expect(page.getByTestId('session-status')).toContainText('Session active', {
      timeout: 15_000,
    })
    expect(body.session_encrypt).toBe(true)
    expect(body.auto_save).toBe(true)
    expect(body.auto_save_session_name).toBe('e2e-api')
    expect(body.chat_history_file).toBe(true)
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
