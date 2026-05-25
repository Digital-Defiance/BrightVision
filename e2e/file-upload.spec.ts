import { expect, test } from '@playwright/test'
import { defaultTurnEvents } from './helpers/fixtures'
import { openChat, startMockSession } from './helpers/session'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

test.describe('Image/PDF attach (roadmap #16)', () => {
  test('web file input uploads via POST .../files/upload', async ({ page }) => {
    await startMockSession(page, { messageTurns: [defaultTurnEvents()] })
    await openChat(page)

    const uploadReq = page.waitForRequest(
      (req) =>
        req.method() === 'POST' && req.url().includes('/files/upload'),
      { timeout: 15_000 }
    )

    await page.locator('input[type="file"][accept*="image"]').setInputFiles({
      name: 'diagram.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    })

    const req = await uploadReq
    const body = req.postDataJSON() as { files?: { filename: string }[] }
    expect(body.files?.[0]?.filename).toBe('diagram.png')

    await expect(page.getByText(/Attached 1 file/i)).toBeVisible({ timeout: 10_000 })
  })

  test('desktop attach button uses native picker (mock Tauri)', async ({ page }) => {
    const { tauriMock } = await startMockSession(page, { tauri: true })
    await openChat(page)

    await expect(page.getByTestId('chat-attach-native')).toBeVisible()
    await expect(page.getByTestId('chat-attach-web')).toHaveCount(0)

    tauriMock!.resetLog()
    await page.getByTestId('chat-attach-native').click({ force: true })

    await expect(page.getByText(/Attached 1 file/i)).toBeVisible({ timeout: 10_000 })
    expect(tauriMock!.getLog().commands).toContain('pick_and_stage_chat_images')
  })
})
