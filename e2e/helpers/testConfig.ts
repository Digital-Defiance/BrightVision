import type { Page } from '@playwright/test'

/** Minimal config for web e2e (core API mocked at /api/core). */
export const E2E_CONFIG = {
  model: 'test/model',
  extraParams: '{}',
  workingDir: '.',
  autoApproveLimit: 0,
  promptBeforeCommit: false,
  autoStageOnDone: true,
  coreEnginePath: 'aider-vision-core',
  pythonPath: '',
  coreApiUrl: '/api/core',
  coreApiToken: '',
  contextFiles: [] as string[],
}

export async function primeVisionApp(page: Page) {
  await page.addInitScript((cfg) => {
    localStorage.setItem('vision-welcome-dismissed', '1')
    localStorage.setItem('aider-vision-config', JSON.stringify(cfg))
  }, E2E_CONFIG)
}

export async function gotoVision(page: Page) {
  await primeVisionApp(page)
  await page.goto('/')
}
