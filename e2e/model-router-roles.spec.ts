import { expect, test } from '@playwright/test'
import { installMockCoreApi } from './helpers/mockCoreApi'
import { E2E_CONFIG, E2E_CONFIG_STORAGE_KEY, gotoVision } from './helpers/testConfig'

const MODEL_ROUTER_PREFS_STORAGE_KEY = 'bright-vision-model-router'

const ROUTER_PREFS = {
  enabled: true,
  models: [
    {
      id: 'fast',
      tier: 'fast',
      model: 'ollama_chat/deepseek-coder:6.7b',
      enabled: true,
      label: 'Fast',
    },
    {
      id: 'code',
      tier: 'code',
      model: 'ollama_chat/qwen3.6:27b',
      enabled: true,
      label: 'Code',
    },
    {
      id: 'think',
      tier: 'think',
      model: 'ollama_chat/deepseek-r1:32b',
      enabled: true,
      label: 'Think',
    },
  ],
  tokenFastMax: 4096,
  tokenHeavyMin: 12000,
  keepAliveFastSec: 300,
  keepAliveHeavySec: -1,
  escalateOnFailure: true,
}

function turnWithRoute(ev: Record<string, unknown>) {
  return [
    ev,
    { type: 'token', text: 'Mock reply.' },
    { type: 'done', assistant_text: 'Mock reply.', edited_files: [] },
  ]
}

async function primeRouterRolesApp(page: import('@playwright/test').Page) {
  const cfg = { ...E2E_CONFIG, model: 'ollama_chat/qwen3.6:27b' }
  await page.addInitScript(
    ([config, configKey, routerKey, router]) => {
      localStorage.setItem(configKey, JSON.stringify(config))
      localStorage.setItem(routerKey, JSON.stringify(router))
    },
    [cfg, E2E_CONFIG_STORAGE_KEY, MODEL_ROUTER_PREFS_STORAGE_KEY, ROUTER_PREFS] as const
  )
}

test.describe('Model router roles (mocked SSE)', () => {
  test('assistant reply shows think tier edge for think route', async ({ page }) => {
    await primeRouterRolesApp(page)
    await installMockCoreApi(page, {
      messageTurns: [
        turnWithRoute({
          type: 'model_route',
          tier: 'think',
          role: 'think',
          model: 'ollama_chat/deepseek-r1:32b',
          reasons: ['keyword:architect'],
          enable_thinking: true,
        }),
      ],
    })
    await gotoVision(page, { skipCoreMock: true, skipConfigPrime: true })
    await page.getByTestId('nav-terminal').click()
    await page.getByTestId('terminal-start').click()
    await expect(page.getByTestId('session-status')).toContainText('Session active', {
      timeout: 60_000,
    })
    await page.getByTestId('nav-chat').click()
    await page.getByTestId('chat-input').fill('Refactor the session pool architecture')
    await page.getByTestId('chat-send').click()
    await expect(page.getByTestId('chat-message-assistant').last()).toHaveAttribute(
      'data-model-route-tier',
      'think',
      { timeout: 30_000 }
    )
    await expect(page.getByText('Mock reply.')).toBeVisible()
  })

  test('assistant reply shows code tier edge for code route', async ({ page }) => {
    await primeRouterRolesApp(page)
    await installMockCoreApi(page, {
      messageTurns: [
        turnWithRoute({
          type: 'model_route',
          tier: 'code',
          role: 'code',
          model: 'ollama_chat/qwen3.6:27b',
          reasons: ['code_task'],
          enable_thinking: false,
        }),
      ],
    })
    await gotoVision(page, { skipCoreMock: true, skipConfigPrime: true })
    await page.getByTestId('nav-terminal').click()
    await page.getByTestId('terminal-start').click()
    await expect(page.getByTestId('session-status')).toContainText('Session active', {
      timeout: 60_000,
    })
    await page.getByTestId('nav-chat').click()
    await page.getByTestId('chat-input').fill('Implement the login handler')
    await page.getByTestId('chat-send').click()
    await expect(page.getByTestId('chat-message-assistant').last()).toHaveAttribute(
      'data-model-route-tier',
      'code',
      { timeout: 30_000 }
    )
  })

  test('session create sends think_model in model_router payload', async ({ page }) => {
    let routerPayload: Record<string, unknown> | undefined
    await primeRouterRolesApp(page)
    await installMockCoreApi(page, {
      onSessionCreate: (body) => {
        routerPayload = body.model_router as Record<string, unknown> | undefined
      },
    })
    await gotoVision(page, { skipCoreMock: true, skipConfigPrime: true })
    await page.getByTestId('nav-terminal').click()
    await page.getByTestId('terminal-start').click()
    await expect(page.getByTestId('session-status')).toContainText('Session active', {
      timeout: 60_000,
    })
    expect(routerPayload?.enabled).toBe(true)
    expect(routerPayload?.think_model).toBe('ollama_chat/deepseek-r1:32b')
    expect(routerPayload?.code_model).toBe('ollama_chat/qwen3.6:27b')
  })

  test('force code and think buttons are visible during session', async ({ page }) => {
    await primeRouterRolesApp(page)
    await installMockCoreApi(page)
    await gotoVision(page, { skipCoreMock: true, skipConfigPrime: true })
    await page.getByTestId('nav-terminal').click()
    await page.getByTestId('terminal-start').click()
    await expect(page.getByTestId('session-status')).toContainText('Session active', {
      timeout: 60_000,
    })
    await page.getByTestId('nav-chat').click()
    await expect(page.getByTestId('model-router-force-fast')).toBeVisible()
    await expect(page.getByTestId('model-router-force-code')).toBeVisible()
    await expect(page.getByTestId('model-router-force-think')).toBeVisible()
  })
})
