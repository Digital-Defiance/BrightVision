import { expect, test } from '@playwright/test'
import { expectOptimisticSend, expectTurnIdle } from './helpers/chatSend'
import { defaultTurnEvents } from './helpers/fixtures'
import { openChat, openSettings, startMockSession } from './helpers/session'

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

    await page.addInitScript(
      ([key, prefs]) => {
        localStorage.setItem('vision-welcome-dismissed', '1')
        localStorage.setItem(key, JSON.stringify(prefs))
      },
      [NTFY_ALERTS_STORAGE_KEY, E2E_NTFY_PREFS] as const
    )

    await startMockSession(page, {
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
})
