import { expect, test } from '@playwright/test'
import { expectOptimisticSend } from './helpers/chatSend'
import { suggestedFilesTurnEvents, suggestedFilesTurnEventsNoCta } from './helpers/fixtures'
import { openChat, startMockSession } from './helpers/session'

test.describe('Suggested files tray (roadmap #32)', () => {
  test.beforeEach(async ({ page }) => {
    await startMockSession(page, { messageTurns: [suggestedFilesTurnEvents()] })
    await openChat(page)
  })

  test('shows tray after assistant lists paths', async ({ page }) => {
    await page.getByTestId('chat-input').fill('Which files should I add?')
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, 'Which files should I add?')

    const tray = page.getByTestId('suggested-files-tray')
    await expect(tray).toBeVisible({ timeout: 15_000 })
    await expect(tray).toContainText('src/suggested-a.ts')
    await expect(tray).toContainText('src/suggested-b.ts')
  })

  test('opens suggested path in editor', async ({ page }) => {
    await page.getByTestId('chat-input').fill('Which files should I add?')
    await page.getByTestId('chat-send').click()
    await expect(page.getByTestId('suggested-files-tray')).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('suggested-file-open-src--suggested-a.ts').click()
    await expect(page.getByTestId('editor-panel')).toBeVisible()
    await expect(page.getByTestId('code-editor')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('editor-file-tabs')).toContainText('suggested-a.ts')
  })
})

test.describe('Suggested files — add all', () => {
  test('batches paths via POST /files and updates context chip', async ({ page }) => {
    await startMockSession(page, { messageTurns: [suggestedFilesTurnEventsNoCta()] })
    await openChat(page)

    await page.getByTestId('chat-input').fill('list files')
    await page.getByTestId('chat-send').click()
    await expect(page.getByTestId('suggested-files-tray')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('suggested-files-add-all').click()

    await expect(page.getByTestId('session-context-chip')).toContainText('2 file', {
      timeout: 15_000,
    })
  })
})
