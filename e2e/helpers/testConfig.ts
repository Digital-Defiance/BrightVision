import type { Page } from '@playwright/test'
import { installMockCoreApi } from './mockCoreApi'

/** Minimal config for web e2e (Vision API mocked at /api/core). */
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
  coreEnginePath: '.',
  pythonPath: '',
  coreApiUrl: '/api/core',
  coreApiToken: '',
  contextFiles: [] as string[],
  sessionEncrypt: false,
  autoSaveSession: false,
  autoLoadSession: false,
  autoSaveSessionName: 'brightvision',
  chatHistoryFile: true,
}

export const E2E_CONFIG_STORAGE_KEY = 'bright-vision-config'

export async function primeVisionApp(page: Page) {
  await page.addInitScript((cfg) => {
    localStorage.setItem('vision-welcome-dismissed', '1')
    localStorage.setItem('bright-vision-config', JSON.stringify(cfg))
  }, E2E_CONFIG)
}

/** Open app with e2e config; install Vision API mocks before navigation (avoids Vite → :8741 proxy noise). */
export async function gotoVision(
  page: Page,
  opts?: { skipCoreMock?: boolean; skipConfigPrime?: boolean }
) {
  if (!opts?.skipConfigPrime) {
    await primeVisionApp(page)
  }
  if (!opts?.skipCoreMock) {
    await installMockCoreApi(page)
  }
  await page.goto('/')
}
