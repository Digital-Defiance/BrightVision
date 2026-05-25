import type { Page } from '@playwright/test'

/** Minimal config for web e2e (core API mocked at /api/core). */
export const E2E_CONFIG = {
  model: 'ollama_chat/test/model',
  ollamaApiBase: '',
  localLlmRoot: '',
  manageLocalLlm: false,
  extraParams: '{}',
  workingDir: '.',
  autoApproveLimit: 0,
  promptBeforeCommit: false,
  autoStageOnDone: true,
  coreEnginePath: 'bright-vision-core',
  pythonPath: '',
  coreApiUrl: '/api/core',
  coreApiToken: '',
  contextFiles: [] as string[],
}

export const E2E_CONFIG_STORAGE_KEY = 'bright-vision-config'

export async function primeVisionApp(page: Page) {
  await page.addInitScript((cfg) => {
    localStorage.setItem('vision-welcome-dismissed', '1')
    localStorage.setItem('bright-vision-config', JSON.stringify(cfg))
  }, E2E_CONFIG)
}

export async function gotoVision(page: Page) {
  await primeVisionApp(page)
  await page.goto('/')
}
