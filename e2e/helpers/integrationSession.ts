import { expect, type Page } from '@playwright/test'
import { buildIntegrationAppConfig } from './integrationEnv'
import { openChat, openTasks } from './session'
import { primeVisionAppConfig } from './testConfig'

/**
 * Prime localStorage for real-core integration (no mockCoreApi, no mockTauri).
 * Web preview must stay non-Tauri so Tasks use /api/core (not invoke read_workspace_todos).
 */
export async function primeIntegrationApp(page: Page) {
  const cfg = buildIntegrationAppConfig()
  await primeVisionAppConfig(page, cfg)
  return cfg
}

/** Terminal → Start against live Vision API on :8741. */
export async function startIntegrationSession(page: Page, timeoutMs?: number) {
  const cap =
    timeoutMs ??
    (process.env.BV_TEST_SUITE_ACTIVE === '1'
      ? 180_000
      : 120_000)
  await page.goto('/')
  await page.getByTestId('nav-terminal').click()
  await page.getByTestId('terminal-start').click()
  await expect(page.getByTestId('session-status')).toContainText('Session active', {
    timeout: cap,
  })
}

export { openChat, openTasks }
