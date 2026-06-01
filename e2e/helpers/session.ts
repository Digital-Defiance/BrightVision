import { expect, type Page } from '@playwright/test'
import { installMockCoreApi, type MockCoreOptions } from './mockCoreApi'
import { installMockTauri, type MockTauriOptions } from './mockTauri'
import { mockSessionForScenario, type ScenarioName } from './scenarios'
import { primeScenarioConfig } from './primeScenarioConfig'
import { gotoVision } from './testConfig'

export { gotoVision } from './testConfig'

export type MockSessionOptions = MockCoreOptions & {
  /** Apply scenario fixture + config prime before session start. */
  scenario?: ScenarioName
  /** Mock Tauri `invoke` for desktop-only UI (git, /add Tab, native pickers). */
  tauri?: boolean | MockTauriOptions
}

function mergeScenarioSessionOpts(
  scenario: ScenarioName,
  opts: MockSessionOptions
): MockSessionOptions {
  const { scenario: _s, tauri: userTauri, ...rest } = opts
  const fromScenario = mockSessionForScenario(scenario, rest)
  if (!userTauri) {
    return { ...fromScenario, ...rest, scenario }
  }
  if (userTauri === true) {
    return { ...fromScenario, ...rest, scenario, tauri: fromScenario.tauri ?? true }
  }
  const base = fromScenario.tauri
  if (typeof base === 'object') {
    return {
      ...fromScenario,
      ...rest,
      scenario,
      tauri: {
        ...base,
        ...userTauri,
        handlers: { ...(base.handlers ?? {}), ...(userTauri.handlers ?? {}) },
      },
    }
  }
  return { ...fromScenario, ...rest, scenario, tauri: userTauri }
}

export async function startMockSession(page: Page, opts: MockSessionOptions = {}) {
  let merged = opts
  if (opts.scenario) {
    await primeScenarioConfig(page, opts.scenario)
    merged = mergeScenarioSessionOpts(opts.scenario, opts)
  }
  const { tauri, ...coreOpts } = merged
  let tauriMock: Awaited<ReturnType<typeof installMockTauri>> | undefined
  if (tauri) {
    const tauriOpts = typeof tauri === 'object' ? tauri : {}
    tauriMock = await installMockTauri(page, tauriOpts)
  }
  await installMockCoreApi(page, coreOpts)
  await gotoVision(page, {
    skipCoreMock: true,
    skipConfigPrime: Boolean(opts.scenario),
  })
  await page.getByTestId('nav-terminal').click()
  await page.getByTestId('terminal-start').click()
  if (opts.scenario === 'session-transcript') {
    await expect(page.getByText('prior user turn from saved session')).toBeVisible({
      timeout: 15_000,
    })
  } else {
    await expect(page.getByTestId('session-status')).toContainText('Session active', {
      timeout: 15_000,
    })
  }
  return { tauriMock }
}

export async function openChat(page: Page) {
  await page.getByTestId('nav-chat').click()
  await expect(page.getByTestId('chat-input')).toBeVisible()
}

export async function openTasks(
  page: Page,
  opts?: { waitForAgentPlanImport?: boolean }
) {
  if (opts?.waitForAgentPlanImport) {
    const importPlan = page.waitForResponse(
      (res) =>
        res.request().method() === 'POST' &&
        res.url().includes('/workspaces/todos/import-agent-plan') &&
        res.ok(),
      { timeout: 30_000 }
    )
    await page.getByTestId('nav-tasks').click()
    await importPlan
  } else {
    await page.getByTestId('nav-tasks').click()
  }
  const panel = page.getByTestId('todo-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByText('Loading…')).toHaveCount(0, { timeout: 15_000 })
}

/** Wait for mocked/core todo list (e.g. sampleTodoStore "First task"). */
export async function expectTasksListReady(page: Page, taskTitle = 'First task') {
  await expect(page.getByTestId('todo-new')).toBeEnabled({ timeout: 15_000 })
  await expect(
    page.getByTestId('todo-panel').getByRole('button', { name: taskTitle })
  ).toBeVisible({ timeout: 15_000 })
}

/** MUI Select for new-task template (not a native `<select>`). */
export async function selectTodoTemplate(page: Page, template: string) {
  await page.getByRole('combobox', { name: 'Template' }).click()
  await page.getByRole('option', { name: template, exact: true }).click()
}

export async function openSettings(page: Page) {
  await page.getByTestId('nav-settings').click()
}
