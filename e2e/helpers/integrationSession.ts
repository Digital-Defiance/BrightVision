import { expect, type Page } from '@playwright/test'
import { buildIntegrationAppConfig } from './integrationEnv'
import { openChat, openTasks } from './session'
import { E2E_CONFIG_STORAGE_KEY } from './testConfig'

/**
 * Prime localStorage for real-core integration (no mockCoreApi, no mockTauri).
 * Web preview must stay non-Tauri so Tasks use /api/core (not invoke read_workspace_todos).
 */
export async function primeIntegrationApp(page: Page) {
  const cfg = buildIntegrationAppConfig()
  await page.addInitScript(
    ([key, config]) => {
      localStorage.setItem('vision-welcome-dismissed', '1')
      localStorage.setItem(key, JSON.stringify(config))
    },
    [E2E_CONFIG_STORAGE_KEY, cfg] as const
  )
  return cfg
}

/** Terminal → Start against live Vision API on :8741. */
export async function startIntegrationSession(page: Page, timeoutMs = 120_000) {
  await page.goto('/')
  await page.getByTestId('nav-terminal').click()
  await page.getByTestId('terminal-start').click()
  await expect(page.getByTestId('session-status')).toContainText('Session active', {
    timeout: timeoutMs,
  })
}

export { openChat, openTasks }
