import { expect, test } from '@playwright/test'
import { installMockCoreApi } from './helpers/mockCoreApi'
import {
  E2E_CURRENT_PROJECT_KEY,
  E2E_PROJECT_GATE_SKIP_KEY,
  E2E_WELCOME_DISMISSED_KEY,
} from './helpers/openProject'
import { gotoVision } from './helpers/testConfig'

test.describe('Open project (IDE launch gate)', () => {
  test('shows launch gate when project gate is not skipped', async ({ page }) => {
    await installMockCoreApi(page)
    await page.goto('/')
    await expect(page.getByTestId('open-project-screen')).toBeVisible()
    await expect(page.getByTestId('nav-chat')).toHaveCount(0)
  })

  test('primed e2e config skips gate and shows project bar', async ({ page }) => {
    await gotoVision(page)
    await expect(page.getByTestId('open-project-screen')).toHaveCount(0)
    await expect(page.getByTestId('project-bar-open')).toBeVisible()
    await expect(page.getByTestId('nav-chat')).toBeVisible()
  })

  test('confirming open stores current project and enters app', async ({ page }) => {
    const projectPath = process.cwd()
    await installMockCoreApi(page)
    await page.goto('/')
    await expect(page.getByTestId('open-project-screen')).toBeVisible()
    await page.getByLabel('Project path').fill(projectPath)
    await page.getByTestId('open-project-confirm').click()
    await expect(page.getByTestId('open-project-screen')).toHaveCount(0)
    await expect(page.getByTestId('project-bar-open')).toBeVisible()
    const stored = await page.evaluate(
      ([skipKey, currentKey, welcomeKey]) => ({
        skip: localStorage.getItem(skipKey),
        project: localStorage.getItem(currentKey),
        welcome: localStorage.getItem(welcomeKey),
      }),
      [E2E_PROJECT_GATE_SKIP_KEY, E2E_CURRENT_PROJECT_KEY, E2E_WELCOME_DISMISSED_KEY] as const
    )
    expect(stored.skip).toBeNull()
    expect(stored.project).toBeTruthy()
    expect(stored.welcome).toBe('1')
  })
})
