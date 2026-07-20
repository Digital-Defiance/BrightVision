import { expect, test } from '@playwright/test'
import {
  IMPLEMENT_E2E_TITLE,
  IMPLEMENT_NAMED_PATH_STEP,
  implementNamedPathTodoStore,
  implementResumeTodoStore,
} from './helpers/implementFixture'
import { openChat, openTasks, startMockSession } from './helpers/session'
import { E2E_CONFIG, primeVisionAppConfig } from './helpers/testConfig'

/** Keep in sync with `SPEC_FOCUS_STORAGE_KEY` in src/storageKeys.ts (do not import — pulls brand PNGs). */
const SPEC_FOCUS_STORAGE_KEY = 'bright-vision-spec-focus'

/** Register after `startMockSession` so this handler wins over the default mock (Playwright LIFO). */
async function captureMessagesPost(
  page: import('@playwright/test').Page,
  onPost: (body: {
    content?: string
    active_todo_id?: string | null
    inject_todo_spec?: boolean
    spec_focus?: boolean
    force_tier?: string | null
    preproc?: boolean
  }) => void
) {
  await page.route('**/api/core/sessions/*/messages', async (route) => {
    if (route.request().method() === 'POST') {
      onPost(
        route.request().postDataJSON() as {
          content?: string
          active_todo_id?: string | null
          inject_todo_spec?: boolean
          spec_focus?: boolean
          force_tier?: string | null
          preproc?: boolean
        }
      )
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

async function primeImplementSession(
  page: import('@playwright/test').Page,
  store: ReturnType<typeof implementNamedPathTodoStore>
) {
  await primeVisionAppConfig(page, E2E_CONFIG)
  await startMockSession(page, { initialTodos: store, skipConfigPrime: true })
}

async function selectImplementTask(page: import('@playwright/test').Page) {
  await openTasks(page)
  await page.getByTestId('todo-panel').getByRole('button', { name: IMPLEMENT_E2E_TITLE }).click()
  await page.getByTestId('todo-panel').getByRole('tab', { name: 'Tasks' }).click()
}

async function sendChat(page: import('@playwright/test').Page) {
  await openChat(page)
  const input = page.getByTestId('chat-input')
  await expect(input).toBeEnabled({ timeout: 15_000 })
  await page.getByTestId('chat-send').click()
}

test.describe('Implement workspace (mocked core)', () => {
  test('Implement step prefills /agent message and sends on chat submit', async ({ page }) => {
    const store = implementNamedPathTodoStore()
    let messageBody: {
      content?: string
      active_todo_id?: string | null
      inject_todo_spec?: boolean
      spec_focus?: boolean
    } = {}
    await primeImplementSession(page, store)
    await captureMessagesPost(page, (body) => {
      messageBody = body
    })

    await selectImplementTask(page)
    const stepRow = page
      .getByTestId('todo-panel')
      .getByText(/2\. Implement auth token/)
      .locator('..')
      .getByRole('button', { name: 'Implement' })
    await expect(stepRow).toBeEnabled({ timeout: 15_000 })
    const patch = page.waitForResponse(
      (res) =>
        res.request().method() === 'PATCH' &&
        res.url().includes('/api/core/workspaces/todos/') &&
        res.ok()
    )
    await stepRow.click()
    await patch

    await openChat(page)
    const input = page.getByTestId('chat-input')
    await expect(input).toHaveValue(/\/agent Implement only implementation task 2:/, {
      timeout: 15_000,
    })
    await expect(input).toHaveValue(/src\/auth\/token\.ts/)

    await sendChat(page)
    await expect.poll(() => messageBody.content).toContain('/agent Implement only implementation task 2:')
    expect(messageBody.active_todo_id).toBe(store.activeId)
    expect(messageBody.inject_todo_spec).toBe(true)
    expect(messageBody.spec_focus).toBe(false)
    expect(messageBody.content).toContain(
      IMPLEMENT_NAMED_PATH_STEP.replace(/^2\. /, '').split(' (depends')[0]!
    )
  })

  test('Resume work prefills workspace snapshot guidance and sends on submit', async ({ page }) => {
    const store = implementResumeTodoStore()
    let messageBody: {
      content?: string
      inject_todo_spec?: boolean
      spec_focus?: boolean
    } = {}
    await primeImplementSession(page, store)
    await captureMessagesPost(page, (body) => {
      messageBody = body
    })

    await selectImplementTask(page)
    await page.getByTestId('todo-resume-work').click()

    await openChat(page)
    const input = page.getByTestId('chat-input')
    await expect(input).toHaveValue(/\/agent Continue the active task/)
    await expect(input).toHaveValue(/workspace snapshot/)

    await sendChat(page)
    await expect.poll(() => messageBody.content).toContain('/agent Continue the active task')
    expect(messageBody.inject_todo_spec).toBe(false)
    expect(messageBody.spec_focus).toBe(false)
    expect(messageBody.content).toContain('ReadRange + EditText')
  })

  test('Implement with spec-focus pref sends spec_focus and inject_todo_spec', async ({ page }) => {
    const store = implementNamedPathTodoStore()
    let messageBody: {
      content?: string
      active_todo_id?: string | null
      inject_todo_spec?: boolean
      spec_focus?: boolean
    } = {}
    await primeVisionAppConfig(page, E2E_CONFIG)
    await page.addInitScript((key) => localStorage.setItem(key, '1'), SPEC_FOCUS_STORAGE_KEY)
    await startMockSession(page, { initialTodos: store, skipConfigPrime: true })
    await captureMessagesPost(page, (body) => {
      messageBody = body
    })

    await selectImplementTask(page)
    const stepRow = page
      .getByTestId('todo-panel')
      .getByText(/2\. Implement auth token/)
      .locator('..')
      .getByRole('button', { name: 'Implement' })
    await expect(stepRow).toBeEnabled({ timeout: 15_000 })
    await stepRow.click()

    await openChat(page)
    const input = page.getByTestId('chat-input')
    await expect(input).toHaveValue(/\/agent Implement only implementation task 2:/, {
      timeout: 15_000,
    })
    await sendChat(page)

    await expect.poll(() => messageBody.spec_focus).toBe(true)
    expect(messageBody.inject_todo_spec).toBe(true)
    expect(messageBody.active_todo_id).toBe(store.activeId)
    expect(messageBody.content).toContain('/agent Implement only implementation task 2:')
    expect(messageBody.content).toContain('src/auth/token.ts')
    // Expanded preamble (Spec-focus mode, Workspace snapshot) is server-side — see test_http_implement_turn.py.
  })
})
