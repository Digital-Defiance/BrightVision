import { expect, test } from '@playwright/test'
import { expectOptimisticSend, expectTurnIdle } from './helpers/chatSend'
import { defaultTurnEvents, sampleTodoStore } from './helpers/fixtures'
import { primeOpenProject } from './helpers/openProject'
import {
  expectTasksListReady,
  openChat,
  openSettings,
  openTasks,
  startMockSession,
} from './helpers/session'
import { E2E_CONFIG } from './helpers/testConfig'

const NTFY_ALERTS_STORAGE_KEY = 'bright-vision-ntfy-alerts'

const E2E_NTFY_PREFS = {
  enabled: true,
  serverBase: 'https://ntfy.sh',
  topic: 'bv_e2e_turn_done',
  minDurationSec: 0,
  notifyWhenBackgroundOnly: false,
}

test.describe('Mobile alerts / ntfy (roadmap #42)', () => {
  test('Settings section enables topic and test ping invokes Tauri', async ({ page }) => {
    const pushes: unknown[] = []

    await startMockSession(page, {
      tauri: {
        handlers: {
          ntfy_send_push: async (args) => {
            pushes.push(args)
            return null
          },
        },
      },
    })
    await openSettings(page)

    const section = page.getByTestId('settings-ntfy-alerts')
    await expect(section).toBeVisible()
    await page.getByTestId('settings-ntfy-enabled').click()

    await page.getByTestId('settings-ntfy-test').click()
    await expect.poll(() => pushes.length).toBe(1)

    const payload = pushes[0] as { title?: string; message?: string; topic?: string }
    expect(String(payload.title ?? '')).toMatch(/BrightVision/i)
    expect(String(payload.message ?? '')).toMatch(/Test notification/i)
    expect(String(payload.topic ?? '').length).toBeGreaterThan(0)
  })

  test('turn done sends push when alerts enabled (mock SSE)', async ({ page }) => {
    const pushes: unknown[] = []

    await primeOpenProject(page, E2E_CONFIG.workingDir)
    await page.addInitScript(
      ([key, prefs]) => {
        localStorage.setItem(key, JSON.stringify(prefs))
      },
      [NTFY_ALERTS_STORAGE_KEY, E2E_NTFY_PREFS] as const
    )

    await startMockSession(page, {
      skipConfigPrime: true,
      messageTurns: [defaultTurnEvents()],
      tauri: {
        handlers: {
          ntfy_send_push: async (args) => {
            pushes.push(args)
            return null
          },
        },
      },
    })
    await openChat(page)

    const prompt = 'notify me when done'
    await page.getByTestId('chat-input').fill(prompt)
    await page.getByTestId('chat-send').click()
    await expectOptimisticSend(page, prompt)

    await expect.poll(() => pushes.length, { timeout: 15_000 }).toBe(1)
    await expectTurnIdle(page, 15_000)
    const payload = pushes[0] as { title?: string; message?: string; topic?: string }
    expect(String(payload.title ?? '')).toMatch(/BrightVision/i)
    expect(String(payload.message ?? '')).toMatch(/Turn finished/i)
    expect(String(payload.message ?? '')).toMatch(/1 file/)
    expect(payload.topic).toBe(E2E_NTFY_PREFS.topic)
  })

  // FIXME: spec-job ntfy push requires full Tauri lifecycle; workspace mismatch
  // previously masked this (the button was disabled for a different reason).
  // The inline generate path + Tauri mock don't complete the job poll cycle.
  test.fixme('spec job done sends push when alerts enabled', async ({ page }) => {
    const pushes: unknown[] = []

    await primeOpenProject(page, E2E_CONFIG.workingDir)
    await page.addInitScript(
      ([key, prefs, configKey, config]) => {
        localStorage.setItem(key, JSON.stringify(prefs))
        localStorage.setItem(configKey, JSON.stringify(config))
      },
      [NTFY_ALERTS_STORAGE_KEY, E2E_NTFY_PREFS, 'bright-vision-config', E2E_CONFIG] as const
    )

    await startMockSession(page, {
      skipConfigPrime: true,
      initialTodos: sampleTodoStore(),
      messageTurns: [defaultTurnEvents()],
      tauri: {
        handlers: {
          ntfy_send_push: async (args) => {
            pushes.push(args)
            return null
          },
        },
      },
    })

    // Send a chat message to confirm the session is fully live (ntfy fires on done)
    await openChat(page)
    await page.getByTestId('chat-input').fill('warm up')
    await page.getByTestId('chat-send').click()
    await expectTurnIdle(page, 15_000)
    // First push is from the turn-done above; clear it
    pushes.length = 0

    await openTasks(page)
    await expectTasksListReady(page)
    await page.getByTestId('todo-panel').getByRole('button', { name: 'First task' }).click()
    await expect(page.getByTestId('todo-generate-spec-wizard')).toBeEnabled({ timeout: 15_000 })
    await page.getByTestId('todo-generate-spec-wizard').click()

    await expect.poll(() => pushes.length, { timeout: 15_000 }).toBe(1)
    const payload = pushes[0] as { title?: string; message?: string; topic?: string }
    expect(String(payload.title ?? '')).toMatch(/BrightVision/i)
    expect(String(payload.message ?? '')).toMatch(/Requirements generation/i)
    expect(String(payload.message ?? '')).toMatch(/First task/i)
    expect(String(payload.message ?? '')).toMatch(/Ready in BrightVision/)
    expect(payload.topic).toBe(E2E_NTFY_PREFS.topic)
  })
})
