import { expect, test } from '@playwright/test'
import { startMockSession } from './helpers/session'

test.describe('Local LLM ping (#36)', () => {
  test('shows Ollama tags and ps snapshot in Settings', async ({ page }) => {
    await startMockSession(page, { tauri: true })
    await page.getByTestId('nav-settings').click()
    const snap = page.getByTestId('ollama-models-snapshot')
    await expect(snap).toBeVisible({ timeout: 10_000 })
    await expect(snap).toContainText('/api/tags')
    await expect(snap).toContainText('/api/ps')
    await expect(snap).toContainText('test/model')
  })

  test('Ping LLM shows success in Settings', async ({ page }) => {
    await startMockSession(page, { tauri: true })
    await page.getByTestId('nav-settings').click()
    await page.getByTestId('local-llm-ping').click()
    const result = page.getByTestId('local-llm-ping-result')
    await expect(result).toBeVisible({ timeout: 10_000 })
    await expect(result).toContainText('LLM OK')
    await expect(result).toContainText('Core OK')
  })
})
