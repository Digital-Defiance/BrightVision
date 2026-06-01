import { expect, test } from '@playwright/test'
import { emptyTodoStore, sampleTodoStore } from './helpers/fixtures'
import { openChat, startMockSession } from './helpers/session'

/** Keep in sync with `SPEC_FOCUS_STORAGE_KEY` in src/storageKeys.ts (do not import — pulls brand PNGs). */
const SPEC_FOCUS_STORAGE_KEY = 'bright-vision-spec-focus'

/** Register after `startMockSession` so this handler wins over the default mock (Playwright LIFO). */
async function captureMessagesPost(
  page: import('@playwright/test').Page,
  onPost: (body: { spec_focus?: boolean; content?: string }) => void
) {
  await page.route('**/api/core/sessions/*/messages', async (route) => {
    if (route.request().method() === 'POST') {
      onPost(route.request().postDataJSON() as { spec_focus?: boolean; content?: string })
      const done = `data: ${JSON.stringify({ type: 'done', assistant_text: 'ok' })}\n\n`
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: `data: ${JSON.stringify({ type: 'user_message', text: 'hi' })}\n\n${done}`,
      })
      return
    }
    await route.continue()
  })
}

async function primeSpecFocusPref(page: import('@playwright/test').Page) {
  await page.addInitScript((key) => localStorage.setItem(key, '1'), SPEC_FOCUS_STORAGE_KEY)
}

async function sendChatMessage(page: import('@playwright/test').Page, text: string) {
  await openChat(page)
  const input = page.getByTestId('chat-input')
  await expect(input).toBeEnabled({ timeout: 15_000 })
  await input.fill(text)
  await page.getByTestId('chat-send').click()
}

test.describe('Spec-focus gating', () => {
  test('Chat spec-focus toggle without active task does not send spec_focus', async ({
    page,
  }) => {
    let messageBody: { spec_focus?: boolean; content?: string } = {}
    await primeSpecFocusPref(page)
    await startMockSession(page, { initialTodos: emptyTodoStore() })
    await captureMessagesPost(page, (body) => {
      messageBody = body
    })
    await sendChatMessage(page, 'Git tab revert button')

    await expect.poll(() => messageBody.content).toBeTruthy()
    expect(messageBody.spec_focus).toBeFalsy()
    expect(messageBody.content).not.toContain('Spec-focus mode')
  })

  test('Chat spec-focus with active task sends spec_focus', async ({ page }) => {
    let messageBody: { spec_focus?: boolean; content?: string } = {}
    const store = sampleTodoStore()
    store.activeId = 'task-a'
    await primeSpecFocusPref(page)
    await startMockSession(page, { initialTodos: store })
    await captureMessagesPost(page, (body) => {
      messageBody = body
    })
    await sendChatMessage(page, 'Tighten REQ wording')

    await expect.poll(() => messageBody.spec_focus).toBe(true)
  })
})
