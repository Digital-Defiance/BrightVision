import { expect, test } from '@playwright/test'
import { installMockCoreApi } from './helpers/mockCoreApi'
import { gotoVision } from './helpers/testConfig'

test.describe.configure({ mode: 'serial' })

test.describe('Core API session lifecycle (mocked /api/core)', () => {
  test.setTimeout(60_000)
  test.beforeEach(async ({ page }) => {
    await gotoVision(page)
    await page.getByTestId('nav-terminal').click()
  })

  test('start then stop reaches idle with session live', async ({ page }) => {
    await installMockCoreApi(page)
    await page.getByTestId('terminal-start').click()
    await expect(page.getByTestId('session-status')).toContainText('Session active', {
      timeout: 15_000,
    })
    await page.getByTestId('nav-terminal').click()
    await expect(page.getByTestId('terminal-start')).toBeDisabled()
    await expect(page.getByTestId('terminal-stop')).toBeEnabled()

    await page.getByTestId('terminal-stop').click({ force: true })
    await expect(page.getByTestId('session-status')).toContainText('Stopped', {
      timeout: 10_000,
    })
    await expect(page.getByTestId('vision-activity')).toHaveCount(0)
    await expect(page.getByTestId('terminal-start')).toBeEnabled()
    await expect(page.getByTestId('terminal-stop')).toBeDisabled()
  })

  test('stop stays enabled while connecting to slow health', async ({ page }) => {
    await installMockCoreApi(page, { healthDelayMs: 3_000 })
    await page.reload()
    await page.getByTestId('nav-terminal').click()

    await page.getByTestId('terminal-start').click()

    const activity = page.getByTestId('vision-activity')
    await expect(activity).toBeVisible({ timeout: 5_000 })
    await expect(activity).toHaveAttribute('data-phase', 'connecting')

    await expect(page.getByTestId('terminal-stop')).toBeEnabled()
    await expect(page.getByTestId('terminal-start')).toBeDisabled()

    await page.getByTestId('terminal-stop').click({ force: true })

    await expect(activity).toHaveCount(0, { timeout: 10_000 })
    await expect(page.getByTestId('session-status')).toContainText('Stopped')
    await expect(page.getByTestId('terminal-start')).toBeEnabled()
    await expect(page.getByTestId('terminal-stop')).toBeDisabled()
  })

  test('unreachable health shows error then recovery', async ({ page }) => {
    await installMockCoreApi(page)
    await page.route('**/api/core/health', (route) => route.abort('failed'))
    await page.reload()
    await page.getByTestId('nav-terminal').click()

    await page.getByTestId('terminal-start').click()

    await expect(page.getByRole('alert').filter({ hasText: /Could not start/i })).toBeVisible({
      timeout: 25_000,
    })
    await expect(page.getByTestId('vision-activity')).toHaveAttribute('data-phase', 'error', {
      timeout: 5_000,
    })
    await expect(page.getByTestId('terminal-start')).toBeEnabled()

    await installMockCoreApi(page)
    await page.getByTestId('terminal-start').click()
    await expect(page.getByTestId('session-status')).toContainText('Session active', {
      timeout: 15_000,
    })
  })

  test('stop during connect then start succeeds', async ({ page }) => {
    await installMockCoreApi(page, { healthDelayMs: 6_000 })
    await page.reload()
    await page.getByTestId('nav-terminal').click()

    await page.getByTestId('terminal-start').click()
    await expect(page.getByTestId('vision-activity')).toHaveAttribute('data-phase', 'connecting', {
      timeout: 5_000,
    })

    await page.getByTestId('terminal-stop').click({ force: true })
    await expect(page.getByTestId('vision-activity')).toHaveCount(0, { timeout: 10_000 })

    await installMockCoreApi(page)
    await page.getByTestId('terminal-start').click()
    await expect(page.getByTestId('session-status')).toContainText('Session active', {
      timeout: 20_000,
    })
  })
})
