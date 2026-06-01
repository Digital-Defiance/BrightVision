import { expect, type Page } from '@playwright/test'
import {
  buildRouterPrefsForStorage,
  buildLlmE2eConfig,
  resolveOllamaTagWithFallback,
  resolveVisionModel,
  visionModelFromTag,
} from './llmEnv'
import { openChat } from './session'
import { E2E_CONFIG_STORAGE_KEY } from './testConfig'

// Keep test helpers decoupled from app bundle imports (e.g. brand asset PNGs in src/brand.ts).
const MODEL_ROUTER_PREFS_STORAGE_KEY = 'bright-vision-model-router'

export type LlmE2eConfigOverrides = Partial<ReturnType<typeof buildLlmE2eConfig>>

/** Prime localStorage and resolve model (same as hello-llm). */
export async function primeLlmE2eApp(
  page: Page,
  overrides: LlmE2eConfigOverrides = {}
): Promise<ReturnType<typeof buildLlmE2eConfig>> {
  const cfg = {
    ...buildLlmE2eConfig(),
    model:
      overrides.model ||
      resolveVisionModel() ||
      visionModelFromTag(await resolveOllamaTagWithFallback()),
    ...overrides,
  }
  const routerPrefs = buildRouterPrefsForStorage()
  await page.addInitScript(
    ([key, config, routerKey, router]) => {
      localStorage.setItem('vision-welcome-dismissed', '1')
      localStorage.setItem(key, JSON.stringify(config))
      if (router) {
        localStorage.setItem(routerKey, JSON.stringify(router))
      }
    },
    [E2E_CONFIG_STORAGE_KEY, cfg, MODEL_ROUTER_PREFS_STORAGE_KEY, routerPrefs] as const
  )
  return cfg
}

/** Terminal → Start, wait for live session. */
export async function startLlmE2eSession(page: Page, sessionTimeoutMs = 120_000) {
  await page.goto('/')
  await page.getByTestId('nav-terminal').click()
  await page.getByTestId('terminal-start').click()
  await expect(page.getByTestId('session-status')).toContainText('Session active', {
    timeout: sessionTimeoutMs,
  })
}

export async function openLlmChat(page: Page) {
  await openChat(page)
}
