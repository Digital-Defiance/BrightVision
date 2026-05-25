import { expect, type Page } from '@playwright/test'
import { installMockCoreApi, type MockCoreOptions } from './mockCoreApi'
import { installMockTauri, type MockTauriOptions } from './mockTauri'
import { gotoVision } from './testConfig'

export { gotoVision } from './testConfig'

export type MockSessionOptions = MockCoreOptions & {
  /** Mock Tauri `invoke` for desktop-only UI (git, /add Tab, native pickers). */
  tauri?: boolean | MockTauriOptions
}

export async function startMockSession(page: Page, opts: MockSessionOptions = {}) {
  const { tauri, ...coreOpts } = opts
  let tauriMock: Awaited<ReturnType<typeof installMockTauri>> | undefined
  if (tauri) {
    const tauriOpts = typeof tauri === 'object' ? tauri : {}
    tauriMock = await installMockTauri(page, tauriOpts)
  }
  await installMockCoreApi(page, coreOpts)
  await gotoVision(page)
  await page.getByTestId('nav-terminal').click()
  await page.getByTestId('terminal-start').click()
  await expect(page.getByTestId('session-status')).toContainText('Session active', {
    timeout: 15_000,
  })
  return { tauriMock }
}

export async function openChat(page: Page) {
  await page.getByTestId('nav-chat').click()
  await expect(page.getByTestId('chat-input')).toBeVisible()
}

export async function openTasks(page: Page) {
  const todosLoaded = page.waitForResponse(
    (res) =>
      res.request().method() === 'GET' &&
      res.url().includes('/workspaces/todos') &&
      res.ok(),
    { timeout: 15_000 }
  )
  await page.getByTestId('nav-tasks').click()
  await todosLoaded
  await expect(page.getByTestId('todo-panel')).toBeVisible()
}

export async function openSettings(page: Page) {
  await page.getByTestId('nav-settings').click()
}
